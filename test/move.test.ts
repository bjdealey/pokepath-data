import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseMove } from "../src/parse/move.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/attackdex-tackle.html", import.meta.url)), "utf8");
const tackle = parseMove(html, "https://www.serebii.net/attackdex/tackle.shtml");

test("parses Gen-3 move stats", () => {
  assert.equal(tackle.slug, "tackle");
  assert.equal(tackle.name, "Tackle");
  assert.equal(tackle.type, "normal");
  assert.equal(tackle.power, 35); // Gen 3 value (40 in later gens)
  assert.equal(tackle.accuracy, 95); // Gen 3 value (100 later)
  assert.equal(tackle.pp, 35);
});

test("derives Gen-3 category from type", () => {
  assert.equal(tackle.category, "physical"); // Normal is physical in Gen 3
});

test("captures the effect text", () => {
  assert.match(tackle.effect, /tackle/i);
});

test("status moves have null power/accuracy and status category", () => {
  const agility = parseMove(
    readFileSync(fileURLToPath(new URL("./fixtures/attackdex-agility.html", import.meta.url)), "utf8"),
    "https://www.serebii.net/attackdex/agility.shtml",
  );
  assert.equal(agility.category, "status");
  assert.equal(agility.power, null);
  assert.equal(agility.accuracy, null);
});
