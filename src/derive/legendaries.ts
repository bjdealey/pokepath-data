// Derive the catchable legendaries/mythicals from each Pokémon's pokedex-rs
// Emerald location text (already scraped into pokemon/<slug>.json). No network.
// Method is classified from that text: roaming (Lati@s), event (ticket/
// distribution: Mew/Deoxys/Ho-Oh/Lugia/Jirachi), else a fixed static battle.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import type { Legendary, PokemonRecord } from "../types.ts";

// The Gen-3 obtainable legendary/mythical set (national dex slugs).
const SET = [
  "regirock", "regice", "registeel", "latias", "latios", "kyogre", "groudon",
  "rayquaza", "mew", "lugia", "ho-oh", "jirachi", "deoxys",
];

const methodOf = (loc: string): Legendary["method"] =>
  /roam|wild in hoenn after/i.test(loc) ? "roaming"
  : /faraway|birth|navel|special event|bonus|distribut/i.test(loc) ? "event"
  : "static";

export function deriveLegendaries() {
  const out: Legendary[] = [];
  const missing: string[] = [];
  for (const slug of SET) {
    const f = `${DATASET}pokemon/${slug}.json`;
    if (!existsSync(f)) { missing.push(slug); continue; }
    const rec = JSON.parse(readFileSync(f, "utf8")) as PokemonRecord;
    const loc = rec.locations?.emerald;
    if (!loc) { missing.push(slug); continue; }
    out.push({ pokemon: rec.slug, natdex: rec.natdex, method: methodOf(loc), location: loc });
  }
  out.sort((a, b) => a.natdex - b.natdex);
  writeFileSync(`${DATASET}games/emerald/legendaries.json`, JSON.stringify(out, null, 2));
  return {
    legendaries: out.length,
    byMethod: out.reduce<Record<string, number>>((m, l) => ((m[l.method] = (m[l.method] ?? 0) + 1), m), {}),
    missing,
  };
}
