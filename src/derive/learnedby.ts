// Derive the move → Pokémon reverse index by inverting every Pokémon's learnset
// (level-up + TM/HM). No network. Bakes a `learnedBy` list into each move
// record so /moves/:slug returns its learners. Run after `pokemon` + `moves`.
// (Egg moves and move-tutor moves aren't in the learnsets yet, so they're not
// reflected here.)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import type { LearnedByEntry, MoveRecord, PokemonRecord } from "../types.ts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Pure join: match learnset move names to move slugs, group learners per move. */
export function buildLearnedBy(pokemon: PokemonRecord[], moves: MoveRecord[]) {
  const nameToSlug = new Map<string, string>();
  for (const m of moves) nameToSlug.set(norm(m.name), m.slug);

  const learners = new Map<string, LearnedByEntry[]>();
  const unmatched = new Set<string>();
  const push = (moveName: string, entry: LearnedByEntry) => {
    const slug = nameToSlug.get(norm(moveName));
    if (!slug) {
      unmatched.add(moveName);
      return;
    }
    const list = learners.get(slug) ?? [];
    if (!learners.has(slug)) learners.set(slug, list);
    list.push(entry);
  };

  for (const p of pokemon) {
    const who = { pokemon: p.slug, natdex: p.natdex };
    for (const lu of p.learnset.levelUp) push(lu.move, { ...who, method: "level-up", level: lu.level });
    for (const tm of p.learnset.machine) push(tm.move, { ...who, method: "machine", machine: tm.machine });
    for (const mv of p.learnset.egg ?? []) push(mv, { ...who, method: "egg" });
    for (const mv of p.learnset.tutor ?? []) push(mv, { ...who, method: "tutor" });
  }
  for (const list of learners.values()) list.sort((a, b) => a.natdex - b.natdex || (a.level ?? 0) - (b.level ?? 0));
  return { learners, unmatched: [...unmatched].sort() };
}

export function deriveLearnedBy() {
  const readAll = <T>(sub: string): T[] => {
    const dir = `${DATASET}${sub}/`;
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "index.json")
      .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as T);
  };
  const pokemon = readAll<PokemonRecord>("pokemon");
  const moves = readAll<MoveRecord>("moves");
  const { learners, unmatched } = buildLearnedBy(pokemon, moves);

  const dir = `${DATASET}moves/`;
  for (const m of moves) {
    m.learnedBy = learners.get(m.slug) ?? [];
    writeFileSync(`${dir}${m.slug}.json`, JSON.stringify(m, null, 2));
  }

  return {
    moves: moves.length,
    withLearners: [...learners.values()].filter((l) => l.length).length,
    totalLinks: [...learners.values()].reduce((n, l) => n + l.length, 0),
    unmatched,
  };
}
