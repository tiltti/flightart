import { USER_AGENT } from "@/lib/config";

// Public photo galleries used both by the manual picker on the aircraft page
// and by the background collection of stack photos.

export interface PhotoCandidate {
  id: string;
  thumb: string;
  full: string;
  source: string;
  photographer: string;
  link: string;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

interface PsPhoto {
  id?: string;
  thumbnail_large?: { src?: string };
  link?: string;
  photographer?: string;
}

export async function planespotters(path: string): Promise<PhotoCandidate[]> {
  const body = (await getJson(
    `https://api.planespotters.net/pub/photos/${path}`,
  )) as { photos?: PsPhoto[] } | null;
  return (body?.photos ?? [])
    .filter((p) => p.thumbnail_large?.src)
    .map((p) => ({
      id: `ps-${p.id ?? p.thumbnail_large!.src}`,
      thumb: p.thumbnail_large!.src!,
      full: p.thumbnail_large!.src!,
      source: "planespotters",
      photographer: p.photographer ?? "planespotters.net",
      link: p.link ?? "https://www.planespotters.net",
    }));
}

interface CommonsPage {
  title?: string;
  imageinfo?: {
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: { Artist?: { value?: string } };
    mime?: string;
  }[];
}

export async function commons(reg: string): Promise<PhotoCandidate[]> {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `"${reg}" aircraft`,
    gsrnamespace: "6",
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "800",
  });
  const body = (await getJson(`https://commons.wikimedia.org/w/api.php?${q}`)) as {
    query?: { pages?: Record<string, CommonsPage> };
  } | null;
  return Object.values(body?.query?.pages ?? {})
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl || !/^image\/(jpeg|png)/.test(ii.mime ?? "")) return null;
      const artist = (ii.extmetadata?.Artist?.value ?? "")
        .replace(/<[^>]*>/g, "")
        .trim();
      return {
        id: `wc-${p.title}`,
        thumb: ii.thumburl,
        full: ii.thumburl,
        source: "commons",
        photographer: artist || "Wikimedia Commons",
        link: ii.descriptionurl ?? "https://commons.wikimedia.org",
      };
    })
    .filter((c): c is PhotoCandidate => c !== null);
}

export async function findCandidates(
  hex: string,
  registration: string | null,
): Promise<PhotoCandidate[]> {
  const reg = registration?.trim() ?? "";
  const [psHex, psReg, wc] = await Promise.all([
    planespotters(`hex/${hex}`),
    reg ? planespotters(`reg/${encodeURIComponent(reg)}`) : Promise.resolve([]),
    reg ? commons(reg) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  return [...psHex, ...psReg, ...wc].filter((c) => {
    if (seen.has(c.thumb)) return false;
    seen.add(c.thumb);
    return true;
  });
}
