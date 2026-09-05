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

// Ruby/Sapphire trades page (/rubysapphire/trades.shtml) uses a different layout:
// one detail table per trade with a "Trader requests a <X>" line. The received
// species is the `/pokearth/sprites/rs/NNN.png` sprite; the requested (give)
// species is the `/pokedex-bw/icon/MMM.png` icon — both national-dex numbers, so
// they resolve the same way. Held item sits before "<Nature> Nature".
export function parseRsTrades(html: string): RawTrade[] {
  const $ = cheerio.load(html);
  const out: RawTrade[] = [];
  const seen = new Set<string>();
  $("table").each((_i, t) => {
    const $t = $(t);
    const rs = $t.find('img[src*="/pokearth/sprites/rs/"]');
    if (rs.length !== 1 || !/Trader requests/i.test($t.text())) return; // one detail table per trade
    const receiveNatdex = Number(($(rs[0]).attr("src") ?? "").match(/rs\/(\d+)\.png/i)?.[1] ?? 0);
    const giveNatdex = Number(($t.find('img[src*="/pokedex-bw/icon/"]').first().attr("src") ?? "").match(/icon\/(\d+)\.png/i)?.[1] ?? 0);
    if (!receiveNatdex || !giveNatdex) return;
    const key = `${giveNatdex}/${receiveNatdex}`;
    if (seen.has(key)) return;
    seen.add(key);
    const item = clean($t.text()).match(/Hold Item:\s*(.*?)\s*[A-Z][a-zï]+\s+Nature/)?.[1]?.trim() || null;
    out.push({ giveNatdex, receiveNatdex, heldItem: item && item !== "None" ? item : null });
  });
  return out;
}
