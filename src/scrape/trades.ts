// Scrape Emerald in-game trades (/emerald/trade.shtml) → games/emerald/trades.json.
// Resolves each side's national-dex number to a slug via the Pokémon index (run
// after `pokemon`). A way to obtain mons not otherwise in Hoenn (Meowth, Horsea).
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import { fetchCached } from "../fetch.ts";
import { parseTrades, parseRsTrades } from "../parse/emerald-trades.ts";
import { GAMES, type Game } from "../games.ts";
import type { InGameTrade } from "../types.ts";

// Emerald and R/S use different trade-page layouts (dextable vs per-trade detail
// tables), so parse each with its own reader; both yield give/receive national-
// dex numbers resolved to slugs below.
export async function scrapeTrades(game: Game = "emerald", refresh = false) {
  const html = await fetchCached(GAMES[game].tradeUrl, { refresh });
  const raw = game === "emerald" ? parseTrades(html) : parseRsTrades(html);

  const indexPath = `${DATASET}pokemon/index.json`;
  if (!existsSync(indexPath)) throw new Error("run `pokemon` first — needs pokemon/index.json to resolve dex numbers");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as Array<{ slug: string; natdex: number }>;
  const byDex = new Map(index.map((p) => [p.natdex, p.slug]));

  const trades: InGameTrade[] = [];
  const unresolved: string[] = [];
  for (const t of raw) {
    const give = byDex.get(t.giveNatdex);
    const receive = byDex.get(t.receiveNatdex);
    if (!give || !receive) { unresolved.push(`${t.giveNatdex}/${t.receiveNatdex}`); continue; }
    trades.push({ give: { pokemon: give, natdex: t.giveNatdex }, receive: { pokemon: receive, natdex: t.receiveNatdex, heldItem: t.heldItem } });
  }

  const dir = `${DATASET}games/${game}/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}trades.json`, JSON.stringify(trades, null, 2));
  return { trades: trades.length, unresolved };
}
