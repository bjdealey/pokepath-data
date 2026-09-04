import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { codeKey } from "../src/derive/machines.ts";

test("codeKey joins learnset codes and item slugs", () => {
  assert.equal(codeKey("TM06"), "TM6"); // learnset
  assert.equal(codeKey("tm6"), "TM6"); // gym reward
  assert.equal(codeKey("tm06"), "TM6"); // item slug
  assert.equal(codeKey("hm01"), "HM1");
});

test("machines.json is the canonical Gen-3 TM/HM table", () => {
  const m = JSON.parse(readFileSync(fileURLToPath(new URL("../dataset/gen3/machines.json", import.meta.url)), "utf8"));
  assert.equal(m.length, 58); // 50 TMs + 8 HMs
  const surf = m.find((x: { machine: string }) => x.machine === "HM03");
  assert.equal(surf.move, "Surf");
  assert.equal(surf.moveSlug, "surf"); // type/category now come from moves/surf.json, not duplicated here
  const toxic = m.find((x: { machine: string }) => x.machine === "TM06");
  assert.equal(toxic.move, "Toxic");
});
