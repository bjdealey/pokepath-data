import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseExits } from "../src/parse/connectivity.ts";

const r = parseExits(readFileSync(fileURLToPath(new URL("./fixtures/pokearth-route101-oras.html", import.meta.url)), "utf8"));

test("parses directed map exits", () => {
  assert.equal(r.name, "Route 101");
  assert.deepEqual(r.exits, { north: "oldaletown", south: "littleroottown" });
});
