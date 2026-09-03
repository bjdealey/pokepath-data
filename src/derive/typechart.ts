// Derive the Gen-3 type effectiveness chart from the per-Pokémon `damageTaken`.
// A pure-type Pokémon's damageTaken IS that defending type's column, so pick
// one pure representative per type. Flying has no pure Gen-3 rep, so derive it
// from a Bug/Flying mon (Bug has no immunities to mask the division). No network.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PokemonRecord } from "../types.ts";

const DATASET = fileURLToPath(new URL("../../dataset/", import.meta.url));
const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel",
];

const colOf = (rep: PokemonRecord): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const atk of TYPES) c[atk] = rep.damageTaken[atk] ?? 1;
  return c;
};

export function deriveTypechart() {
  const pdir = `${DATASET}pokemon/`;
  const pokemon = readdirSync(pdir)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => JSON.parse(readFileSync(pdir + f, "utf8")) as PokemonRecord);

  const pureRep = new Map<string, PokemonRecord>();
  for (const p of pokemon) if (p.types.length === 1 && !pureRep.has(p.types[0]!)) pureRep.set(p.types[0]!, p);

  const columns: Record<string, Record<string, number>> = {};
  for (const t of TYPES) if (pureRep.has(t)) columns[t] = colOf(pureRep.get(t)!);

  if (!columns.flying && pureRep.has("bug")) {
    const bf = pokemon.find((p) => p.types.length === 2 && p.types.includes("bug") && p.types.includes("flying"));
    if (bf) {
      const bug = colOf(pureRep.get("bug")!);
      const bfc = colOf(bf);
      const flying: Record<string, number> = {};
      for (const atk of TYPES) flying[atk] = bug[atk] ? Math.round((bfc[atk]! / bug[atk]!) * 4) / 4 : bfc[atk]!;
      columns.flying = flying;
    }
  }

  // chart[attackingType][defendingType] = multiplier
  const chart: Record<string, Record<string, number>> = {};
  for (const atk of TYPES) {
    chart[atk] = {};
    for (const def of TYPES) chart[atk]![def] = columns[def]?.[atk] ?? 1;
  }

  writeFileSync(`${DATASET}typechart.json`, JSON.stringify(chart, null, 2));
  return { types: TYPES.length, resolved: Object.keys(columns).length, missing: TYPES.filter((t) => !columns[t]) };
}
