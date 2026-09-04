// Parse Serebii's Emerald in-game trades page (/emerald/trade.shtml). Each trade
// is a table.dextable with two "#NNN Name" cells — the Pokémon you give and the
// one you receive (often holding mail). Returns national-dex numbers + held item;
// the scraper resolves those to slugs via the Pokémon index.
import * as cheerio from "cheerio";
import type { Element } from "domhandler";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export interface RawTrade {
  giveNatdex: number;
  receiveNatdex: number;
  heldItem: string | null;
}

export function parseTrades(html: string): RawTrade[] {
  const $ = cheerio.load(html);
  const out: RawTrade[] = [];
  $("table.dextable").each((_i, t) => {
    const monCells = $(t).find("td").filter((_j, c) => /^#\d+/.test(clean($(c).text()))).toArray();
    if (monCells.length < 2) return;
    const parse = (c: Element) => {
      const txt = clean($(c).text());
      return { natdex: Number(txt.match(/^#(\d+)/)?.[1] ?? 0), held: txt.match(/\b([A-Za-z]+ Mail)\b/)?.[1] ?? null };
    };
    const g = parse(monCells[0]!);
    const r = parse(monCells[1]!);
    if (!g.natdex || !r.natdex) return;
    out.push({ giveNatdex: g.natdex, receiveNatdex: r.natdex, heldItem: r.held });
  });
  return out;
}
