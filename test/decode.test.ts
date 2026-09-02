import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeMixed } from "../src/decode.ts";

test("preserves a stray Latin-1 é next to valid UTF-8 katakana", () => {
  // "Pok" + 0xE9(é) + "mon " + キ (U+30AD, valid 3-byte UTF-8 E3 82 AD)
  const bytes = Uint8Array.from([0x50, 0x6f, 0x6b, 0xe9, 0x6d, 0x6f, 0x6e, 0x20, 0xe3, 0x82, 0xad]);
  assert.equal(decodeMixed(bytes), "Pokémon キ");
});

test("plain ASCII is unchanged", () => {
  assert.equal(decodeMixed(new TextEncoder().encode("Starter Pokemon")), "Starter Pokemon");
});
