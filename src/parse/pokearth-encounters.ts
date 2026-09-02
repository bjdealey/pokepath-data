// Parse Emerald wild encounters from a Serebii pokearth "3rd" page. Emerald
// rosters are `table.dextable` blocks with a `td.emerald` "Pokémon Emerald"
// header (distinct from the Ruby/Sapphire `table.extradextable` blocks). The
// encounter method comes from the nearest preceding method anchor.
import * as cheerio from "cheerio";
import type { EmeraldEncounter } from "../types.ts";

const METHOD_ANCHORS: Record<string, string> = {
  grass: "grass",
  surf: "surf",
  oldrod: "old-rod",
  goodrod: "good-rod",
  superrod: "super-rod",
  rocksmash: "rock-smash",
  rock: "rock-smash",
  smash: "rock-smash",
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const monSlug = (name: string) =>
  name.toLowerCase().replace(/['.]/g, "").replace(/♀/g, "-f").replace(/♂/g, "-m").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function parseEmeraldEncounters(html: string): EmeraldEncounter[] {
  const $ = cheerio.load(html);
  const out: EmeraldEncounter[] = [];
  const seen = new Set<string>();
  let method = "";

  $("a[name], table.dextable").each((_i, el) => {
    if (el.tagName === "a") {
      const anchor = ($(el).attr("name") ?? "").toLowerCase();
      if (METHOD_ANCHORS[anchor]) method = METHOD_ANCHORS[anchor]!;
      return;
    }
    const $t = $(el);
    if (!$t.find("td.emerald").length) return; // Emerald encounter tables only

    const spriteRow = $t.find("tr").filter((_r, r) => $(r).find('img[src*="/sprites/"]').length > 0).first();
    const sprites = spriteRow.find("img").toArray();
    const names = $t.find("td.name").toArray();
    const rates = $t.find("td.rate").toArray();
    const levels = $t.find("td.level").toArray();

    names.forEach((c, i) => {
      const name = clean($(c).text());
      if (!name || !method) return;
      const key = `${method}|${monSlug(name)}`;
      if (seen.has(key)) return;
      seen.add(key);

      const src = $(sprites[i]).attr("src") ?? "";
      const natdex = Number(src.match(/(\d+)\.png/i)?.[1] ?? 0);
      const rateText = rates[i] ? clean($(rates[i]).text()) : "";
      const rate = /\d/.test(rateText) ? Number(rateText.replace(/[^\d]/g, "")) : null;
      const lvl = levels[i] ? clean($(levels[i]).text()).match(/(\d+)\s*-\s*(\d+)|(\d+)/) : null;
      const levelMin = lvl ? Number(lvl[1] ?? lvl[3]) : null;
      const levelMax = lvl ? Number(lvl[2] ?? lvl[3]) : null;

      out.push({ pokemon: monSlug(name), natdex, method, rate, levelMin, levelMax });
    });
  });

  return out;
}
