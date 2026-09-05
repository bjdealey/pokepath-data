// Derive how each species can be obtained in Emerald — aggregating wild
// encounters, the evolution edge into it, breeding eligibility, gifts, trades,
// and events. `obtainable` is transitive: reachable via a direct source, or
// evolves from an obtainable species. No network. Powers living-dex /
// completionist planning. Emits games/emerald/obtainability.json. Run after
// `pokemon` and the game data (encounters, gifts, trades, legendaries).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import type { Game } from "../games.ts";
import type { EvolutionEdge, Obtainability, PokemonRecord } from "../types.ts";

export function deriveObtainability(game: Game = "emerald") {
  const G = `${DATASET}games/${game}/`;
  const pdir = `${DATASET}pokemon/`;
  const pokemon = readdirSync(pdir)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => JSON.parse(readFileSync(pdir + f, "utf8")) as PokemonRecord);

  // The evolution edge INTO each species (family edges repeat across the family).
  const evolvesInto = new Map<string, { from: string; method: string }>();
  for (const p of pokemon) {
    for (const e of (p.evolutions ?? []) as EvolutionEdge[]) if (!evolvesInto.has(e.to)) evolvesInto.set(e.to, { from: e.from, method: e.method });
  }

  // Wild spots per species (dedup by location+method).
  const enc = JSON.parse(readFileSync(`${G}encounters.json`, "utf8")) as Record<string, { encounters: Array<{ pokemon: string; method: string }> }>;
  const wild = new Map<string, Array<{ location: string; method: string }>>();
  for (const [location, v] of Object.entries(enc)) {
    for (const e of v.encounters ?? []) {
      const list = wild.get(e.pokemon) ?? [];
      if (!wild.has(e.pokemon)) wild.set(e.pokemon, list);
      if (!list.some((w) => w.location === location && w.method === e.method)) list.push({ location, method: e.method });
    }
  }

  const has = (file: string, pick: (x: any) => string) => new Set(((JSON.parse(readFileSync(`${G}${file}`, "utf8")) as any[]) ?? []).map(pick));
  const giftSet = has("gifts.json", (g) => g.pokemon);
  const tradeSet = has("trades.json", (t) => t.receive.pokemon);
  const eventSet = has("legendaries.json", (l) => l.pokemon);

  const records: Obtainability[] = pokemon
    .map((p) => ({
      pokemon: p.slug,
      natdex: p.natdex,
      wild: (wild.get(p.slug) ?? []).sort((a, b) => a.location.localeCompare(b.location)),
      evolvesFrom: evolvesInto.get(p.slug) ?? null,
      breedable: (p.eggGroups ?? []).length > 0 && !p.eggGroups.includes("Cannot Breed"),
      gift: giftSet.has(p.slug),
      trade: tradeSet.has(p.slug),
      event: eventSet.has(p.slug),
      obtainable: false,
    }))
    .sort((a, b) => a.natdex - b.natdex);

  // Transitive obtainability: a direct source, or evolves from an obtainable
  // species (breeding is not a root — it re-obtains something already reachable).
  const bySlug = new Map(records.map((r) => [r.pokemon, r]));
  const direct = (r: Obtainability) => r.wild.length > 0 || r.gift || r.trade || r.event;
  for (const r of records) r.obtainable = direct(r);
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of records) {
      if (!r.obtainable && r.evolvesFrom && bySlug.get(r.evolvesFrom.from)?.obtainable) {
        r.obtainable = true;
        changed = true;
      }
    }
  }

  writeFileSync(`${G}obtainability.json`, JSON.stringify(records, null, 2));
  return {
    species: records.length,
    obtainable: records.filter((r) => r.obtainable).length,
    wildSourced: records.filter((r) => r.wild.length).length,
  };
}
