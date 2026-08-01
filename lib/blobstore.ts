import { promises as fs } from "fs";
import path from "path";

// Image storage: Vercel Blob when a token is present (production), plain
// files under data/ otherwise (local dev). Keys look like "photos/<hex>.jpg".
export const isRemoteBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const LOCAL_ROOT = path.join(process.cwd(), "data");

export interface StoredBlob {
  key: string;
  url: string;
}

function localPath(key: string): string {
  const safe = key.replace(/\.\./g, "");
  return path.join(LOCAL_ROOT, safe);
}

export async function putBlob(
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<StoredBlob> {
  if (isRemoteBlob) {
    const { put } = await import("@vercel/blob");
    // random suffix keeps CDN caches honest when a photo is replaced
    const res = await put(key, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return { key: res.pathname, url: res.url };
  }
  const file = localPath(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return { key, url: `/api/blob/${key}` };
}

export async function getBlobBytes(
  blob: { key: string; url: string } | null,
): Promise<Buffer | null> {
  if (!blob) return null;
  if (isRemoteBlob) {
    try {
      const res = await fetch(blob.url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  try {
    return await fs.readFile(localPath(blob.key));
  } catch {
    return null;
  }
}

export async function deleteBlob(key: string | null): Promise<void> {
  if (!key) return;
  if (isRemoteBlob) {
    try {
      const { del } = await import("@vercel/blob");
      await del(key);
    } catch {
      // an orphaned blob is harmless; never fail the request over it
    }
    return;
  }
  await fs.rm(localPath(key), { force: true });
}

// local-mode only: serve bytes for /api/blob/<key>
export async function readLocalBlob(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(localPath(key));
  } catch {
    return null;
  }
}
