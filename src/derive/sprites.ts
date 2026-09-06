// Bake Serebii sprite URLs into each Pokémon record (no network). Sprites are a
// pure function of the national-dex number via Serebii's stable URL scheme
// (src/sprites.ts) — normal + shiny battle sprites per game (Ruby/Sapphire,
// Emerald) plus the official artwork. Run after `pokemon`; re-running is
// idempotent (the `sprites` key is rebuilt in place, just before `source`).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { GEN_DIR } from "../paths.ts";
import { spritesForDex } from "../sprites.ts";
import type { PokemonRecord } from "../types.ts";

export function deriveSprites(): { pokemon: number } {
  const dir = `${GEN_DIR}pokemon/`;
  let count = 0;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "index.json") continue;
    const path = dir + file;
    const record = JSON.parse(readFileSync(path, "utf8")) as PokemonRecord;
    // Rebuild with `sprites` immediately before the `source` trailer, dropping
    // any prior value so the key position is deterministic across re-runs.
    delete record.sprites;
    const { source, ...rest } = record;
    const updated: PokemonRecord = { ...rest, sprites: spritesForDex(record.natdex), source };
    writeFileSync(path, JSON.stringify(updated, null, 2));
    count++;
  }
  return { pokemon: count };
}
