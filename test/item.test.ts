import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseItem } from "../src/parse/item.ts";

const potion = parseItem(
  readFileSync(fileURLToPath(new URL("./fixtures/itemdex-potion.html", import.meta.url)), "utf8"),
  "https://www.serebii.net/itemdex/potion.shtml",
);

test("parses item category, effect, and prices", () => {
  assert.equal(potion.slug, "potion");
  assert.equal(potion.name, "Potion");
  assert.equal(potion.category, "Recovery");
  assert.match(potion.effect, /20\s*HP|HP by 20/i);
  assert.equal(potion.price, 200);
  assert.equal(potion.sellPrice, 100);
});
