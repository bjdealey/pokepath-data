import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseItems } from "../src/parse/pokearth-items.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/pokearth-victoryroad-3rd.html", import.meta.url)), "utf8");
const items = parseItems(html);

test("parses items with obtain method", () => {
  const tm29 = items.find((i) => i.item === "TM29");
  assert.ok(tm29, "TM29 should be found");
  assert.equal(tm29!.method, "Floor");

  const pokeball = items.find((i) => i.item === "Poké Ball");
  assert.ok(pokeball, "Poké Ball should be found");
  assert.equal(pokeball!.method, "Itemfinder");
});

test("uses Serebii's itemdex slug from the link href", () => {
  const fullRestore = items.find((i) => i.item === "Full Restore");
  assert.equal(fullRestore!.slug, "fullrestore");
});
