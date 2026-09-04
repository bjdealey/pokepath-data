// Pins the Gen-3 Pokémon parser against a committed real page (Bulbasaur).
// If Serebii changes its layout, this fails loudly instead of silently
// producing empty/garbage records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parsePokemon, decodeEvoMethod } from "../src/parse/pokemon.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/pokedex-rs-001.html", import.meta.url)), "utf8");
const { record, evoDex, evoEdges, abilityDesc } = parsePokemon(html, "test://pokedex-rs/001");

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
  assert.equal(record.abilities[0], "Overgrow"); // abilities are now names; definitions live in the collection
  assert.ok(abilityDesc.Overgrow, "raw effect text should be surfaced for the abilities derive");
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

test("learnset (egg + tutor)", () => {
  assert.ok(record.learnset.egg.includes("Petal Dance"), "egg moves");
  assert.ok(record.learnset.egg.includes("Light Screen"));
  // tutor pulls from both "FRLG/Emerald" and "Emerald" tutor tables
  assert.ok(record.learnset.tutor.includes("Swords Dance"), "FRLG/Emerald tutor");
  assert.ok(record.learnset.tutor.includes("Snore"), "Emerald-only tutor");
});

test("evolution chain", () => {
  assert.deepEqual(evoDex, [1, 2, 3]);
});

test("damage taken (type effectiveness, non-neutral only)", () => {
  assert.equal(record.damageTaken.fire, 2); // Grass weak to Fire
  assert.equal(record.damageTaken.grass, 0.25); // Grass/Poison doubly resists Grass
  assert.equal(record.damageTaken.psychic, 2); // Poison weak to Psychic
  assert.equal(record.damageTaken.water, 0.5);
  assert.equal(record.damageTaken.normal, undefined); // neutral omitted
});

test("evolution edges carry the method", () => {
  assert.deepEqual(evoEdges, [
    { from: 1, to: 2, method: "Level 16" },
    { from: 2, to: 3, method: "Level 32" },
  ]);
});

test("decodeEvoMethod handles stones / trade+item / friendship / personality", () => {
  assert.equal(decodeEvoMethod("firestone.png"), "Fire Stone");
  assert.equal(decodeEvoMethod("eeveewaterstone.png"), "Water Stone");
  assert.equal(decodeEvoMethod("trade.png"), "Trade");
  assert.equal(decodeEvoMethod("tradekingsrock.png"), "Trade holding King's Rock");
  assert.equal(decodeEvoMethod("eeveehappinessnight.png"), "High Friendship (Nighttime)");
  assert.equal(decodeEvoMethod("levelpokeball20.png"), "Level 20 (empty party slot + spare Poké Ball → Shedinja)");
});

// Magnemite: genderless + two possible abilities (edge cases the full-dex
// scrape surfaced).
const magnemite = parsePokemon(
  readFileSync(fileURLToPath(new URL("./fixtures/pokedex-rs-081.html", import.meta.url)), "utf8"),
  "test://pokedex-rs/081",
).record;

test("genderless is normalized", () => {
  assert.equal(magnemite.genderRatio, "genderless");
});

test("two abilities split into an array", () => {
  assert.deepEqual(magnemite.abilities, ["Magnet Pull", "Sturdy"]);
});
