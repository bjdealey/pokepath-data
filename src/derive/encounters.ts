// Derive per-location wild encounters for a game by inverting each Pokémon's
// scraped per-game location string. No network — reads the pokemon dataset.
// Emerald-exact mons + method; rate/level are not available from Serebii.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEmeraldLocations } from "../parse/locations.ts";
import type { GameSlug, PokemonRecord } from "../types.ts";

const DATASET = fileURLToPath(new URL("../../dataset/", import.meta.url));

interface LocEncounter { pokemon: string; natdex: number; method: string }
interface LocationEntry { slug: string; location: string; encounters: LocEncounter[] }

export function deriveEncounters(game: GameSlug = "emerald") {
  const pdir = `${DATASET}pokemon/`;
  const files = readdirSync(pdir).filter((f) => f.endsWith(".json") && f !== "index.json");

  const locations = new Map<string, LocationEntry>();
  const unparsed: string[] = [];
  let contributing = 0;

  for (const f of files) {
    const p = JSON.parse(readFileSync(pdir + f, "utf8")) as PokemonRecord;
    const text = p.locations[game];
    const encs = parseEmeraldLocations(text);
    if (text && /Route/i.test(text) && encs.length === 0) unparsed.push(`${p.slug}: ${text}`);
    if (encs.length) contributing++;
    for (const e of encs) {
      let loc = locations.get(e.locationSlug);
      if (!loc) {
        loc = { slug: e.locationSlug, location: e.location, encounters: [] };
        locations.set(e.locationSlug, loc);
      }
      if (!loc.encounters.some((x) => x.pokemon === p.slug && x.method === e.method)) {
        loc.encounters.push({ pokemon: p.slug, natdex: p.natdex, method: e.method });
      }
    }
  }

  // Routes ordered numerically, named locations alphabetically after.
  const key = (name: string) => {
    const m = name.match(/^Route (\d+)/);
    return m ? `0:${m[1]!.padStart(4, "0")}` : `1:${name.toLowerCase()}`;
  };
  const sorted = [...locations.values()].sort((a, b) => key(a.location).localeCompare(key(b.location)));
  for (const l of sorted) l.encounters.sort((a, b) => a.natdex - b.natdex);

  const byslug: Record<string, LocationEntry> = {};
  for (const l of sorted) byslug[l.slug] = l;

  const dir = `${DATASET}games/${game}/`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}encounters.json`, JSON.stringify(byslug, null, 2));
  writeFileSync(
    `${dir}locations.json`,
    JSON.stringify(sorted.map((l) => ({ slug: l.slug, location: l.location, count: l.encounters.length })), null, 2),
  );

  return { locations: sorted.length, contributing, unparsed };
}
