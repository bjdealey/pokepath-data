import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLearnedBy } from "../src/derive/learnedby.ts";
import type { MoveRecord, PokemonRecord } from "../src/types.ts";

const mkMon = (slug: string, natdex: number, levelUp: unknown[], machine: unknown[]) =>
  ({ slug, natdex, learnset: { levelUp, machine } }) as unknown as PokemonRecord;
const mkMove = (slug: string, name: string) => ({ slug, name }) as unknown as MoveRecord;

const pokemon = [
  mkMon("bulbasaur", 1, [{ level: null, move: "Tackle" }], [{ machine: "TM06", move: "Toxic" }]),
  mkMon("charmander", 4, [{ level: 1, move: "Tackle" }], []),
];
const moves = [mkMove("tackle", "Tackle"), mkMove("toxic", "Toxic")];
const { learners } = buildLearnedBy(pokemon, moves);

test("inverts level-up learners, sorted by natdex", () => {
  const tackle = learners.get("tackle")!;
  assert.deepEqual(tackle.map((l) => l.pokemon), ["bulbasaur", "charmander"]);
  assert.equal(tackle[0]!.method, "level-up");
});

test("TM learners record the machine", () => {
  const toxic = learners.get("toxic")!;
  assert.equal(toxic[0]!.pokemon, "bulbasaur");
  assert.equal(toxic[0]!.method, "machine");
  assert.equal(toxic[0]!.machine, "TM06");
});

test("name matching is punctuation/space/case-insensitive", () => {
  const r = buildLearnedBy(
    [mkMon("x", 9, [{ level: 5, move: "Self-Destruct" }], [])],
    [mkMove("selfdestruct", "SelfDestruct")],
  );
  assert.equal(r.learners.get("selfdestruct")?.length, 1);
  assert.equal(r.unmatched.length, 0);
});
