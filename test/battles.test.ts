import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEmeraldBattles } from "../src/parse/pokearth-trainers.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/pokearth-route110-3rd.html", import.meta.url)), "utf8");
const battles = parseEmeraldBattles(html, "route110");

test("finds the Emerald (trainers-em) rival battles only", () => {
  assert.equal(battles.length, 6); // Brendan ×3 + May ×3 starter variants
  assert.ok(battles.every((b) => b.kind === "rival"));
  assert.deepEqual([...new Set(battles.map((b) => (/May/.test(b.label) ? "May" : "Brendan")))].sort(), ["Brendan", "May"]);
});

test("captures starter-choice variants", () => {
  const variants = [...new Set(battles.map((b) => b.variant))].sort();
  assert.deepEqual(variants, ["Mudkip Chosen", "Torchic Chosen", "Treecko Chosen"]);
});

test("variant team is correct (Mudkip chosen → Grovyle ace at L20)", () => {
  const brendanMudkip = battles.find((b) => /Brendan/.test(b.label) && b.variant === "Mudkip Chosen")!;
  assert.equal(brendanMudkip.team.at(-1)!.pokemon, "grovyle");
  assert.equal(brendanMudkip.team.at(-1)!.level, 20);
});
