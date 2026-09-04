// Emerald wild encounters: crawl the Hoenn pokearth "3rd" pages and parse each
// Emerald encounter table (mon + rate + level + method). Replaces the earlier
// approach that inverted per-Pokémon location text (which lacked rate/level).
import { mkdir, writeFile } from "node:fs/promises";
import { GEN_DIR as DATASET } from "../paths.ts";
import { crawlHoenn3rd } from "./hoenn-crawl.ts";
import { parseEmeraldEncounters } from "../parse/pokearth-encounters.ts";
import { locationName } from "../parse/pokearth-trainers.ts";
import type { EmeraldEncounter } from "../types.ts";

const METHOD_ORDER = ["grass", "surf", "rock-smash", "old-rod", "good-rod", "super-rod"];

interface LocationEncounters {
  slug: string;
  location: string;
  encounters: EmeraldEncounter[];
}

export async function scrapeEncounters(refresh = false) {
  const pages = await crawlHoenn3rd(refresh);
  const locations: LocationEncounters[] = [];

  for (const { slug, html } of pages) {
    const encounters = parseEmeraldEncounters(html);
    if (encounters.length) locations.push({ slug, location: locationName(slug), encounters });
  }

  const sortKey = (name: string) => {
    const m = name.match(/^Route (\d+)/);
    return m ? `0:${m[1]!.padStart(4, "0")}` : `1:${name.toLowerCase()}`;
  };
  locations.sort((a, b) => sortKey(a.location).localeCompare(sortKey(b.location)));
  for (const l of locations) {
    l.encounters.sort(
      (a, b) => METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method) || (b.rate ?? 0) - (a.rate ?? 0),
    );
  }

  const byslug: Record<string, LocationEncounters> = {};
  for (const l of locations) byslug[l.slug] = l;

  const dir = `${DATASET}games/emerald/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}encounters.json`, JSON.stringify(byslug, null, 2));
  await writeFile(
    `${dir}locations.json`,
    JSON.stringify(locations.map((l) => ({ slug: l.slug, location: l.location, count: l.encounters.length })), null, 2),
  );

  return {
    pages: pages.length,
    locations: locations.length,
    encounters: locations.reduce((n, l) => n + l.encounters.length, 0),
  };
}
