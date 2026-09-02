import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRouteTrainers } from "../src/parse/pokearth-trainers.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/pokearth-route110-3rd.html", import.meta.url)), "utf8");
const trainers = parseRouteTrainers(html, "route110");

test("captures the whole Emerald trainers-em roster, not just rival/villain", () => {
  assert.ok(trainers.length > 30, `expected many trainers, got ${trainers.length}`);
  assert.ok(trainers.some((t) => t.kind === "trainer"));
  assert.ok(trainers.some((t) => /Youngster Timmy/.test(t.label) && t.kind === "trainer"));
});

test("still tags + retains the rival with starter variants", () => {
  const rival = trainers.filter((t) => t.kind === "rival");
  assert.ok(rival.length >= 6);
  assert.deepEqual([...new Set(rival.map((t) => t.variant))].sort(), ["Mudkip Chosen", "Torchic Chosen", "Treecko Chosen"]);
});

test("regular trainer has a team with levels", () => {
  const timmy = trainers.find((t) => /Youngster Timmy/.test(t.label))!;
  assert.ok(timmy.team.length > 0);
  assert.ok(timmy.team.every((p) => p.level > 0 && p.pokemon));
});
