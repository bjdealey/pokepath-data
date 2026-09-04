import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const chart = JSON.parse(readFileSync(fileURLToPath(new URL("../dataset/gen3/typechart.json", import.meta.url)), "utf8"));

test("Gen-3 type matchups (incl. Steel resisting Ghost/Dark)", () => {
  assert.equal(chart.fire.grass, 2);
  assert.equal(chart.water.fire, 2);
  assert.equal(chart.ground.flying, 0);
  assert.equal(chart.ghost.steel, 0.5); // Gen 3 only (neutral since Gen 6)
  assert.equal(chart.dark.steel, 0.5);
  assert.equal(chart.psychic.dark, 0);
});

test("Flying column (derived via Bug/Flying) is correct", () => {
  assert.equal(chart.electric.flying, 2);
  assert.equal(chart.fighting.flying, 0.5);
  assert.equal(chart.rock.flying, 2);
});

test("full 17x17 chart", () => {
  assert.equal(Object.keys(chart).length, 17);
  for (const row of Object.values(chart)) assert.equal(Object.keys(row as object).length, 17);
});
