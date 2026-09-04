import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTrades } from "../src/parse/emerald-trades.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/emerald-trade.html", import.meta.url)), "utf8");
const trades = parseTrades(html);

test("parses each in-game trade's give/receive dex numbers + held mail", () => {
  assert.ok(trades.length >= 3, `expected ≥3 trades, got ${trades.length}`);
  // Skitty (#300) → Meowth (#52) holding Retro Mail
  const meowth = trades.find((t) => t.receiveNatdex === 52)!;
  assert.equal(meowth.giveNatdex, 300);
  assert.equal(meowth.heldItem, "Retro Mail");
});
