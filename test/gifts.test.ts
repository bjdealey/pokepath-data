import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseGifts } from "../src/parse/pokearth-gifts.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/pokearth-route101-3rd.html", import.meta.url)), "utf8");
const gifts = parseGifts(html, "route101");

test("parses the Emerald starter trio from the gift table", () => {
  const starters = gifts.filter((g) => g.method === "starter");
  assert.equal(starters.length, 3);
  assert.deepEqual(starters.map((g) => g.pokemon).sort(), ["mudkip", "torchic", "treecko"]);
  assert.ok(starters.every((g) => g.level === 5 && g.location === "route101"));
});

test("natdex comes from the Emerald sprite, not the R/S table", () => {
  const treecko = gifts.find((g) => g.pokemon === "treecko")!;
  assert.equal(treecko.natdex, 252);
});
