// Parse the "Gift" Pokémon from a Serebii pokearth "3rd" location page — the
// starter trio (Prof Birch, Route 101) and one-off gifts/eggs (Beldum, Castform,
// the Wynaut egg, …). These live in a table headed "Gift - Emerald" (the R/S
// gifts are a separate "Gift - Ruby/Sapphire" table), using the same td.name /
// td.level cells as the wild-encounter tables. Not wild grass, so kept apart
// from encounters.json.
import * as cheerio from "cheerio";
import { locationName } from "./pokearth-trainers.ts";
import type { Gift } from "../types.ts";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const monSlug = (name: string) =>
  name.toLowerCase().replace(/['.]/g, "").replace(/♀/g, "-f").replace(/♂/g, "-m").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const STARTERS = new Set(["treecko", "torchic", "mudkip"]);

export function parseGifts(html: string, location: string): Gift[] {
  const $ = cheerio.load(html);
  // The Emerald gift table is the one whose header cell reads "Gift - Emerald".
  const header = $("td, th")
    .filter((_i, c) => /^gift\s*-\s*emerald$/i.test(clean($(c).text())))
    .first();
  if (!header.length) return [];
  const table = header.closest("table");

  const sprites = table.find('img[src*="/sprites/"]').toArray();
  const names = table.find("td.name").toArray();
  const levels = table.find("td.level").toArray();

  const out: Gift[] = [];
  names.forEach((c, i) => {
    const name = clean($(c).text());
    if (!name) return;
    const src = $(sprites[i]).attr("src") ?? "";
    const natdex = Number(src.match(/(\d+)\.png/i)?.[1] ?? 0);
    const level = levels[i] ? Number(clean($(levels[i]).text()).match(/\d+/)?.[0] ?? 0) || null : null;
    const slug = monSlug(name);
    out.push({ pokemon: slug, natdex, method: STARTERS.has(slug) ? "starter" : "gift", level, location, locationName: locationName(location) });
  });
  return out;
}
