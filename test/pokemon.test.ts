// Pins the Gen-3 Pokémon parser against a committed real page (Bulbasaur).
// If Serebii changes its layout, this fails loudly instead of silently
// producing empty/garbage records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePokemon } from "../src/parse/pokemon.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/pokedex-rs-001.html", import.meta.url)), "utf8");
const { record, evoDex } = parsePokemon(html, "test://pokedex-rs/001");

test("identity + types", () => {
  assert.equal(record.name, "Bulbasaur");
  assert.equal(record.natdex, 1);
  assert.equal(record.slug, "bulbasaur");
  assert.deepEqual(record.types, ["grass", "poison"]);
});

test("base stats", () => {
  assert.deepEqual(record.baseStats, {
    hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45, total: 318,
  });
});

test("gender ratio + physicals", () => {
  assert.deepEqual(record.genderRatio, { malePct: 87.5, femalePct: 12.5 });
  assert.equal(record.heightM, 0.7);
  assert.equal(record.weightKg, 6.9);
  assert.equal(record.captureRate, 45);
});

test("abilities + egg groups", () => {
  assert.equal(record.abilities[0]?.name, "Overgrow");
  assert.ok(record.abilities[0]?.description);
  assert.ok(record.eggGroups.includes("Monster"));
});

test("localized names", () => {
  assert.ok(record.names["japan"]?.includes("フシギダネ"));
});

test("learnset (level-up + TM)", () => {
  assert.ok(record.learnset.levelUp.some((m) => m.move === "Tackle" && m.level === null));
  assert.ok(record.learnset.levelUp.some((m) => m.move === "Vine Whip" && m.level === 10));
  assert.ok(record.learnset.machine.some((m) => m.machine === "TM06" && m.move === "Toxic"));
});

test("evolution chain", () => {
  assert.deepEqual(evoDex, [1, 2, 3]);
});
