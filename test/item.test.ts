import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseItem, gen3Effect } from "../src/parse/item.ts";

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

test("gen3Effect drops post-Gen-3-only clauses, keeps Gen-3 + gen-agnostic text", () => {
  // Drops a later-gen-only clause, keeps the R/S/E one and the lead-in.
  assert.equal(
    gen3Effect("A useful item. In Ruby, Sapphire & Emerald, do X. In Diamond, Pearl & Platinum, do Y."),
    "A useful item. In Ruby, Sapphire & Emerald, do X.",
  );
  // A clause naming Emerald alongside later gens is kept (it applies to Gen 3).
  assert.match(gen3Effect("Base. In Emerald, Diamond & Pearl, 50% chance. From Black 2 onwards, always."), /In Emerald.*50% chance\.$/);
  // No per-gen structure → untouched (incl. an item whose own name contains "White").
  const wh = "When a stat is lowered, the White Herb restores it.";
  assert.equal(gen3Effect(wh), wh);
});
