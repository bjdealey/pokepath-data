import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEmeraldEncounters } from "../src/parse/pokearth-encounters.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/pokearth-route104-3rd.html", import.meta.url)), "utf8");
const enc = parseEmeraldEncounters(html);

test("parses Emerald encounters with rate + level + method", () => {
  const poochyena = enc.find((e) => e.pokemon === "poochyena" && e.method === "grass")!;
  assert.equal(poochyena.natdex, 261);
  assert.equal(poochyena.rate, 40);
  assert.equal(poochyena.levelMin, 4);
  assert.equal(poochyena.levelMax, 5);
});

test("captures fishing methods with correct level ranges", () => {
  const superRod = enc.find((e) => e.method === "super-rod" && e.pokemon === "magikarp")!;
  assert.equal(superRod.levelMin, 20);
  assert.equal(superRod.levelMax, 45);
});

test("covers multiple methods", () => {
  const methods = new Set(enc.map((e) => e.method));
  assert.ok(methods.has("grass"));
  assert.ok(methods.has("surf"));
  assert.ok(methods.has("old-rod"));
});
