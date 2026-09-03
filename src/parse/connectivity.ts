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
    // e.g. <b>North Exit</b>: <a href="oldaletown.shtml">…
    for (const m of inner.matchAll(/([A-Za-z][A-Za-z-]*)\s*Exit<\/b>\s*:\s*<a\b[^>]*href="[^"]*?([a-z0-9]+)\.shtml"/gi)) {
      exits[m[1]!.toLowerCase()] = m[2]!.toLowerCase();
    }
  }
  // Location name from the page title ("Pokéarth - Hoenn - Route 101").
  const name = clean($("title").text()).replace(/^.*-\s*/, "");
  return { name, exits };
}
