# flightart

Ambient-taulu, joka näyttää kotipisteen (Lohja) yli ja lähistöllä lentävät
koneet: minimalistinen tutkanäkymä + elokuvamainen spotlight yhdestä koneesta
kerrallaan — kuva juuri kyseisestä yksilöstä, tyyppi, operaattori ja reitti.
Kaikki bongaukset kertyvät lokikirjaan (`/history`).

## Käynnistys

```bash
npm run dev
# http://localhost:3005          — päänäyttö (tutka + spotlight)
# http://localhost:3005/history  — lokikirja, statsit, haku ja suodattimet
# http://localhost:3005/settings — asetukset (sijainti, näyttö, rotaatio, data)
```

Konesivu `/aircraft/<hex>` avautuu lokikirjan rekisteritunnuksesta: montako
kertaa nähty, koko bongaushistoria, kuvat — ja työkalut kuvan vaihtoon
(galleriahaku, oma URL, upload), taustanpoiston uusintayritykseen sekä
"photo only" -merkintään jos taustanpoisto ei tuota järkevää tulosta.

Kotipisteen ja säteen oletukset: `.env.local`

```
HOME_NAME=LOHJA
HOME_LAT=60.250
HOME_LON=24.065
RADIUS_NM=50
CONTACT_EMAIL=…        # planespotters vaatii yhteystiedon User-Agentiin
```

Asetussivulta ne voi yliajaa selainkohtaisesti: sijainnin saa selaimen
paikannuksesta tai klikkaamalla karttaa, säteen liukurilla (esikatselu
vieressä), ja tutkan taakse voi kytkeä rannikko- ja rajaviivat.

## Datalähteet

| Lähde | Käyttö | Huom |
|---|---|---|
| [adsb.fi](https://adsb.fi) opendata | lähialueen koneet (readsb JSON) | suomalainen yhteisöverkko; max ~1 req/s, serveri välimuistittaa |
| [adsbdb.com](https://www.adsbdb.com) | konetyyppi, omistaja, callsign → reitti | |
| [Planespotters.net](https://www.planespotters.net) photo API | kuva kyseisestä yksilöstä | vaatii kuvaajan krediitin + linkin — näkyy spotlightin kulmassa |
| [Wikimedia Commons](https://commons.wikimedia.org) | vaihtoehtoiset kuvat galleriahaussa | vapaasti lisensoituja, tekijä talletetaan metatietoihin |
| [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth 1:10m) | tutkan rannikko- ja rajaviivat | public domain, mukana paketissa — ei verkkohakuja |

Kuvat cachetetaan levylle: alkuperäiskuva `data/photos/<hex>.jpg` ja
taustanpoistettu poster-cutout `data/cutouts/<hex>.png` — yksi CDN-haku per
koneyksilö, sen jälkeen kaikki tarjoillaan lokaalisti (`/api/photo`,
`/api/cutout`).

Bongaukset tallentuvat tiedostoon `data/sightings.json` (gitignoressa).
Sama kone 60 min sisällä = sama bongaus.

## Oma ADS-B-vastaanotin (roadmap)

Oma readsb/dump1090 tarjoaa saman JSON-muodon osoitteessa
`http://<vastaanotin>/data/aircraft.json`. Lisää se uutena lähteenä tiedostoon
`lib/sources/` — muu sovellus ei muutu. Samalla bongausten `source`-kenttä
saa oman antennin arvon ("caught on own antenna" -badge).

Muita ideoita: harvinaisuuskorostus (heavyt, militaryt, erikoismaalaukset),
yökirkkauden himmennys, kioskimoodi taululle, vaalea "FlightPortrait"-tyylinen
posteriteema vaihtoehtona.
