// Parse the map exits from a Serebii pokearth location page. The `foocontent`
// cell reads "North Exit: <link> South Exit: <link> …" — each direction links
// to the connected location. Hoenn's topology is identical across games, so the
// ORAS pages (/pokearth/hoenn/<slug>.shtml) are used even for the Emerald data.
import * as cheerio from "cheerio";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function parseExits(html: string): { name: string; exits: Record<string, string> } {
  const $ = cheerio.load(html);
  const cell = $("td.foocontent").filter((_i, c) => /Exit:/i.test($(c).text())).first();
  const exits: Record<string, string> = {};
  if (cell.length) {
    const inner = cell.html() ?? "";
    // e.g. <b>North Exit</b>: <a href="oldaletown.shtml">… (slugs may contain
    // dots, e.g. mt.chimney.shtml — capture the whole filename stem).
    for (const m of inner.matchAll(/([A-Za-z][A-Za-z-]*)\s*Exit<\/b>\s*:\s*<a\b[^>]*href="[^"]*?([a-z0-9.]+)\.shtml"/gi)) {
      exits[m[1]!.toLowerCase()] = m[2]!.toLowerCase();
    }
  }
  // Location name from the page title ("Pokéarth - Hoenn - Route 101").
  const name = clean($("title").text()).replace(/^.*-\s*/, "");
  return { name, exits };
}

/** Parse the "Special Moves used in <location>:" list — the field moves (HMs) a
 * location's traversal needs — from an Emerald /3rd/ pokearth page. Serebii lists
 * them as attackdex links in one paragraph after that bold header. Returns the
 * move names (e.g. ["Cut","Surf"]); empty when the page has no such section. */
export function parseFieldMoves(html: string): string[] {
  const $ = cheerio.load(html);
  const header = $("b").filter((_i, c) => /Special Moves used in/i.test($(c).text())).first();
  if (!header.length) return [];
  const moves: string[] = [];
  header
    .closest("p")
    .find('a[href*="attackdex"]')
    .each((_i, a) => {
      const name = clean($(a).text());
      if (name && !moves.includes(name)) moves.push(name);
    });
  return moves;
}
