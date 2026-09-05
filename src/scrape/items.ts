// Emerald location items: crawl the Hoenn pokearth "3rd" pages and parse each
// page's item tables into a per-location list (item + how it's obtained).
import { mkdir, writeFile } from "node:fs/promises";
import { GEN_DIR as DATASET } from "../paths.ts";
import { crawlHoenn3rd } from "./hoenn-crawl.ts";
import { parseItems } from "../parse/pokearth-items.ts";
import { locationName } from "../parse/pokearth-trainers.ts";
import type { Game } from "../games.ts";
import type { LocationItem } from "../types.ts";


interface LocationItems {
  slug: string;
  location: string;
  items: LocationItem[];
}

// Location items on the pokearth /3rd/ pages are a single shared "Item | Method"
// table (not split by version), so R/S/E get the same set — the same parse,
// written per game. Minor version-specific item differences aren't distinguished
// by Serebii here.
export async function scrapeItems(game: Game = "emerald", refresh = false) {
  const pages = await crawlHoenn3rd(refresh);
  const locations: LocationItems[] = [];

  for (const { slug, html } of pages) {
    const items = parseItems(html);
    if (items.length) locations.push({ slug, location: locationName(slug), items });
  }

  const sortKey = (name: string) => {
    const m = name.match(/^Route (\d+)/);
    return m ? `0:${m[1]!.padStart(4, "0")}` : `1:${name.toLowerCase()}`;
  };
  locations.sort((a, b) => sortKey(a.location).localeCompare(sortKey(b.location)));

  const byslug: Record<string, LocationItems> = {};
  for (const l of locations) byslug[l.slug] = l;

  const dir = `${DATASET}games/${game}/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}items.json`, JSON.stringify(byslug, null, 2));

  return {
    pages: pages.length,
    locations: locations.length,
    items: locations.reduce((n, l) => n + l.items.length, 0),
  };
}
