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

// Ruby/Sapphire encounters live in `table.extradextable` blocks. Serebii splits
// each method into a Ruby table (a method-header row + a "Pokémon Ruby" version
// header) followed by a SEPARATE Sapphire table ("Pokémon Sapphire" header, no
// method row — it inherits the preceding method). Method classes vary (swarm =
// rock smash, fish = any rod), so the method is read from the header text. Data
// rows are sprites (/sprites/rs/) / names / rates / levels.
const methodFromText = (t: string) =>
  /super rod/i.test(t) ? "super-rod" : /good rod/i.test(t) ? "good-rod" : /old rod/i.test(t) ? "old-rod" : /surf/i.test(t) ? "surf" : /rock smash/i.test(t) ? "rock-smash" : /walk|grass/i.test(t) ? "grass" : "";

export function parseRsEncounters(html: string, version: "ruby" | "sapphire"): EmeraldEncounter[] {
  const $ = cheerio.load(html);
  const out: EmeraldEncounter[] = [];
  const seen = new Set<string>();
  let method = ""; // persists across tables (a Sapphire table inherits the method above it)

  $("table.extradextable").each((_i, tbl) => {
    const rows = $(tbl).find("tr").toArray();
    let ver = "";
    for (const r of rows) {
      const cell = $(r).children("td");
      if (cell.length !== 1) continue; // header rows are a single colspan cell
      const cls = (cell.attr("class") ?? "").toLowerCase();
      if (cls === "ruby" || cls === "sapphire") ver = cls;
      else {
        const m = methodFromText(cell.text());
        if (m) method = m;
      }
    }
    if (ver !== version || !method) return;

    const rowWith = (sel: string) => rows.find((r) => $(r).children(sel).length) ?? rows.find((r) => $(r).find(sel).length);
    const sprites = $(rows.find((r) => $(r).find("img.pkmn").length) ?? []).find("img.pkmn").toArray();
    const names = $(rowWith("td.name")).children("td.name").toArray();
    const rates = $(rowWith("td.rate")).children("td.rate").toArray();
    const levels = $(rowWith("td.level")).children("td.level").toArray();

    names.forEach((c, i) => {
      const name = clean($(c).text());
      if (!name) return;
      const key = `${method}|${monSlug(name)}`;
      if (seen.has(key)) return;
      seen.add(key);
      const src = $(sprites[i]).attr("src") ?? $(sprites[i]).closest("a").attr("href") ?? "";
      const natdex = Number(src.match(/(\d+)\.(?:png|shtml)/i)?.[1] ?? 0);
      const rateText = rates[i] ? clean($(rates[i]).text()) : "";
      const rate = /\d/.test(rateText) ? Number(rateText.replace(/[^\d]/g, "")) : null;
      const lvl = levels[i] ? clean($(levels[i]).text()).match(/(\d+)\s*-\s*(\d+)|(\d+)/) : null;
      out.push({ pokemon: monSlug(name), natdex, method, rate, levelMin: lvl ? Number(lvl[1] ?? lvl[3]) : null, levelMax: lvl ? Number(lvl[2] ?? lvl[3]) : null });
    });
  });
  return out;
}

/** Parse encounters for any Gen-3 game from a pokearth /3rd/ page. */
export function parseEncounters(html: string, game: string): EmeraldEncounter[] {
  return game === "emerald" ? parseEmeraldEncounters(html) : parseRsEncounters(html, game as "ruby" | "sapphire");
}
