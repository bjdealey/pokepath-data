// Derive EV-training spots: for each stat, the wild species that award effort
// points in it and where to grind them (evYield × Emerald encounters). No
// network. Emits games/emerald/ev-training.json. Run after `pokemon` +
// `encounters`.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import type { EvTrainingEntry, PokemonRecord } from "../types.ts";

const G = `${DATASET}games/emerald/`;
const STATS = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"];

export function deriveEvTraining() {
  const pdir = `${DATASET}pokemon/`;
  const pokemon = readdirSync(pdir)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => JSON.parse(readFileSync(pdir + f, "utf8")) as PokemonRecord);

  // Wild spots per species (dedup by location+method).
  const enc = JSON.parse(readFileSync(`${G}encounters.json`, "utf8")) as Record<string, { encounters: Array<{ pokemon: string; method: string; rate: number | null }> }>;
  const spots = new Map<string, Array<{ location: string; method: string; rate: number | null }>>();
  for (const [location, v] of Object.entries(enc)) {
    for (const e of v.encounters ?? []) {
      const list = spots.get(e.pokemon) ?? [];
      if (!spots.has(e.pokemon)) spots.set(e.pokemon, list);
      if (!list.some((s) => s.location === location && s.method === e.method)) list.push({ location, method: e.method, rate: e.rate });
    }
  }

  const evTraining: Record<string, EvTrainingEntry[]> = {};
  for (const stat of STATS) {
    const entries: EvTrainingEntry[] = [];
    for (const p of pokemon) {
      const points = p.evYield?.[stat] ?? 0;
      const sp = spots.get(p.slug);
      if (points > 0 && sp?.length) {
        entries.push({ pokemon: p.slug, natdex: p.natdex, points, spots: [...sp].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)) });
      }
    }
    // Best trainers first: most points, then most-common spot, then dex order.
    entries.sort((a, b) => b.points - a.points || (b.spots[0]?.rate ?? 0) - (a.spots[0]?.rate ?? 0) || a.natdex - b.natdex);
    evTraining[stat] = entries;
  }

  writeFileSync(`${G}ev-training.json`, JSON.stringify(evTraining, null, 2));
  return { stats: STATS.length, totalEntries: Object.values(evTraining).reduce((n, e) => n + e.length, 0) };
}
