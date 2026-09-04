// Emerald gift/starter Pokémon: crawl the Hoenn pokearth "3rd" pages (already
// cached by the encounter/trainer crawls) and parse each page's "Gift - Emerald"
// table. Emits a flat games/emerald/gifts.json — the starter trio plus one-off
// gifts/eggs (Beldum, Castform, Wynaut, …). Non-wild, so separate from encounters.
import { mkdir, writeFile } from "node:fs/promises";
import { GEN_DIR as DATASET } from "../paths.ts";
import { crawlHoenn3rd } from "./hoenn-crawl.ts";
import { parseGifts } from "../parse/pokearth-gifts.ts";
import type { Gift } from "../types.ts";

export async function scrapeGifts(refresh = false) {
  const pages = await crawlHoenn3rd(refresh);
  const gifts: Gift[] = [];
  const seen = new Set<string>();
  for (const { slug, html } of pages) {
    for (const g of parseGifts(html, slug)) {
      const key = `${g.location}|${g.pokemon}|${g.method}`;
      if (seen.has(key)) continue;
      seen.add(key);
      gifts.push(g);
    }
  }
  // starters first, then by location.
  gifts.sort((a, b) => (a.method === b.method ? a.location.localeCompare(b.location) : a.method === "starter" ? -1 : 1));

  const dir = `${DATASET}games/emerald/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}gifts.json`, JSON.stringify(gifts, null, 2));

  return { pages: pages.length, gifts: gifts.length, byMethod: gifts.reduce<Record<string, number>>((m, g) => ((m[g.method] = (m[g.method] ?? 0) + 1), m), {}) };
}
