// The 25 Gen-3 natures (introduced in Gen 3, unchanged since): each raises one
// stat 10% and lowers another; five are neutral. Game-constant reference data —
// not derivable from the Pokémon pages and identical everywhere, so it's a fixed
// table here (like the valid-type list), verifiable on Serebii's natures page.
// Emits dataset/gen3/natures.json for the competitive/training calculators.
import { writeFileSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import type { NatureRecord } from "../types.ts";

// [name, increased, decreased] — null/null = neutral. HP is never nature-affected.
const TABLE: Array<[string, string | null, string | null]> = [
  ["Hardy", null, null], ["Lonely", "attack", "defense"], ["Brave", "attack", "speed"],
  ["Adamant", "attack", "spAttack"], ["Naughty", "attack", "spDefense"],
  ["Bold", "defense", "attack"], ["Docile", null, null], ["Relaxed", "defense", "speed"],
  ["Impish", "defense", "spAttack"], ["Lax", "defense", "spDefense"],
  ["Timid", "speed", "attack"], ["Hasty", "speed", "defense"], ["Serious", null, null],
  ["Jolly", "speed", "spAttack"], ["Naive", "speed", "spDefense"],
  ["Modest", "spAttack", "attack"], ["Mild", "spAttack", "defense"], ["Quiet", "spAttack", "speed"],
  ["Bashful", null, null], ["Rash", "spAttack", "spDefense"],
  ["Calm", "spDefense", "attack"], ["Gentle", "spDefense", "defense"], ["Sassy", "spDefense", "speed"],
  ["Careful", "spDefense", "spAttack"], ["Quirky", null, null],
];

export function deriveNatures() {
  const records: NatureRecord[] = TABLE.map(([name, increased, decreased]) => ({
    slug: name.toLowerCase(),
    name,
    increased,
    decreased,
  }));
  writeFileSync(`${DATASET}natures.json`, JSON.stringify(records, null, 2));
  return { natures: records.length, neutral: records.filter((r) => !r.increased).length };
}
