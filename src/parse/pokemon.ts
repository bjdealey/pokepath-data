// Parse a Gen-3 (Ruby/Sapphire/Emerald-era) Serebii Pokédex page
// (e.g. /pokedex-rs/001.shtml) into a PokemonRecord.
//
// Serebii conventions this relies on (stable across the RSE-era pages):
//   - Content lives in <table class="dextable">; each is a titled section
//     whose title is the first cell of its first row ("Stats", "Location", …).
//   - Per-game rows are labeled by the game name in their first cell.
//   - Types / stats are laid out positionally inside their section.
import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { Element } from "domhandler";
import type { BaseStats, GameSlug, PokemonRecord } from "../types.ts";

const GAME_LABELS: Record<string, GameSlug> = {
  ruby: "ruby",
  sapphire: "sapphire",
  emerald: "emerald",
  firered: "firered",
  leafgreen: "leafgreen",
  colosseum: "colosseum",
  xd: "xd",
};

function gameSlug(label: string): GameSlug | undefined {
  return GAME_LABELS[label.toLowerCase().replace(/[^a-z]/g, "")];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const num = (s: string) => Number(s.replace(/[^\d.-]/g, "")) || 0;
const unit = (s: string, re: RegExp): number | undefined => {
  const m = s.match(re);
  return m ? Number(m[1]) : undefined;
};

export interface ParsedPokemon {
  record: PokemonRecord;
  evoDex: number[]; // national numbers in the evolution chain; resolved to slugs later
}

export function parsePokemon(html: string, url: string): ParsedPokemon {
  const $ = cheerio.load(html);

  // Index dextables by their section title (first cell of first row).
  const byTitle = new Map<string, Cheerio<Element>>();
  const tables: Cheerio<Element>[] = [];
  $("table.dextable").each((_, t) => {
    const el = $(t);
    tables.push(el);
    const title = clean(el.find("tr").first().children().first().text());
    if (title && !byTitle.has(title)) byTitle.set(title, el);
  });
  const section = (needle: string) =>
    tables.find((t) => clean(t.find("tr").first().children().first().text()).toLowerCase().includes(needle.toLowerCase()));

  const rowsOf = (t: Cheerio<Element> | undefined) => (t ? t.find("tr").toArray() : []);
  const cells = (tr: Element) => $(tr).children("td,th").toArray();
  const cellText = (td: Element) => clean($(td).text());

  // --- Main info table (title "Name") --------------------------------------
  const info = section("Name");
  let name = "";
  const names: Record<string, string> = {};
  let natdex = 0;
  let genderRatio: PokemonRecord["genderRatio"] = "genderless";
  const types: string[] = [];
  let classification: string | undefined;
  let heightM: number | undefined;
  let weightKg: number | undefined;
  let captureRate: number | undefined;
  let baseEggSteps: number | undefined;
  const abilities: PokemonRecord["abilities"] = [];

  if (info) {
    // Name = first data cell under the "Name" header.
    const headerRow = info.find("tr").first();
    const dataRow = headerRow.next();
    name = cellText(cells(dataRow.get(0)!)[0]!);

    // Types: images inside this table only (each src ends /type/<type>.gif).
    info
      .find("td.cen img")
      .toArray()
      .forEach((img) => {
        const src = $(img).attr("src") ?? "";
        const m = src.match(/\/type\/([a-z]+)\.gif/i);
        if (m && !types.includes(m[1]!.toLowerCase())) types.push(m[1]!.toLowerCase());
      });

    // Labeled two-cell rows: other names, dex numbers, gender split.
    let male: number | undefined;
    let female: number | undefined;
    for (const tr of info.find("tr").toArray()) {
      const c = cells(tr);
      if (c.length !== 2) continue;
      const label = cellText(c[0]!).replace(/:$/, "");
      const val = cellText(c[1]!);
      if (/^(Japan|French|German|Korean|Italian|Spanish)$/i.test(label)) {
        names[label.toLowerCase()] = val;
      } else if (/^National$/i.test(label)) {
        natdex = num(val);
      } else if (/^Male/.test(label)) {
        male = num(val);
      } else if (/^Female/.test(label)) {
        female = num(val);
      }
    }
    if (male !== undefined || female !== undefined) {
      genderRatio =
        (male ?? 0) === 0 && (female ?? 0) === 0
          ? "genderless"
          : { malePct: male ?? 0, femalePct: female ?? 0 };
    }

    // Classification / Height / Weight / Capture Rate / Base Egg Steps:
    // a header row of those labels followed by a fooinfo value row.
    const trs = info.find("tr").toArray();
    for (let i = 0; i < trs.length; i++) {
      const labels = cells(trs[i]!).map(cellText);
      if (labels.some((l) => /Classification/i.test(l)) && trs[i + 1]) {
        const vals = cells(trs[i + 1]!).map(cellText);
        labels.forEach((l, j) => {
          const v = vals[j] ?? "";
          if (/Classification/i.test(l)) classification = v || undefined;
          else if (/Height/i.test(l)) heightM = unit(v, /([\d.]+)\s*m\b/);
          else if (/Weight/i.test(l)) weightKg = unit(v, /([\d.]+)\s*kg\b/);
          else if (/Capture Rate/i.test(l)) captureRate = num(v);
          else if (/Base Egg Steps/i.test(l)) baseEggSteps = num(v);
        });
      }
    }

    // Abilities: rows whose first cell class starts "fooleft" ("Ability: X"),
    // each followed by a description row.
    const infoTrs = info.find("tr").toArray();
    for (let i = 0; i < infoTrs.length; i++) {
      const c0 = cells(infoTrs[i]!)[0];
      if (c0 && ($(c0).attr("class") ?? "").startsWith("fooleft")) {
        const abilityName = cellText(c0).replace(/^Ability:\s*/i, "");
        // Two possible abilities share one cell ("Magnet Pull & Sturdy") and one
        // description row. Split the names; the shared description is best-effort
        // until abilities become their own entity (abilitydex).
        const description = infoTrs[i + 1] ? cellText(cells(infoTrs[i + 1]!)[0]!) : undefined;
        for (const a of abilityName.split(/\s*&\s*|\s+or\s+/)) {
          if (a) abilities.push({ name: a.trim(), description });
        }
      }
    }
  }

  // --- Stats ----------------------------------------------------------------
  let baseStats: BaseStats = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0, total: 0 };
  const stats = section("Stats");
  if (stats) {
    for (const tr of rowsOf(stats)) {
      const c = cells(tr);
      const first = cellText(c[0]!);
      if (/Base Stats/i.test(first) && c.length >= 7) {
        const v = c.slice(1, 7).map((x) => num(cellText(x)));
        baseStats = {
          hp: v[0]!, attack: v[1]!, defense: v[2]!, spAttack: v[3]!, spDefense: v[4]!, speed: v[5]!,
          total: v.reduce((a, b) => a + b, 0),
        };
        break;
      }
    }
  }

  // --- Egg groups (group name is the 2nd cell of each data row) -------------
  const eggGroups: string[] = [];
  const eg = section("Egg Groups");
  if (eg) {
    for (const tr of rowsOf(eg).slice(2)) {
      const c = cells(tr);
      const g = c[1] ? cellText(c[1]) : "";
      if (g && !eggGroups.includes(g)) eggGroups.push(g);
    }
  }

  // --- Per-game location & flavor text --------------------------------------
  const locations: PokemonRecord["locations"] = {};
  const loc = section("Location");
  if (loc) {
    for (const tr of rowsOf(loc)) {
      const c = cells(tr);
      if (c.length < 2) continue;
      const g = gameSlug(cellText(c[0]!));
      if (g) locations[g] = cellText(c[1]!);
    }
  }
  const flavorText: PokemonRecord["flavorText"] = {};
  const flav = section("Flavor Text");
  if (flav) {
    for (const tr of rowsOf(flav)) {
      const c = cells(tr);
      if (c.length < 2) continue;
      const g = gameSlug(cellText(c[0]!));
      if (g) flavorText[g] = cellText(c[1]!);
    }
  }

  // --- Learnset: RSE level-up + TM/HM ---------------------------------------
  const levelUp: PokemonRecord["learnset"]["levelUp"] = [];
  const lvlTable = tables.find((t) => {
    const title = clean(t.find("tr").first().children().first().text());
    return /Level Up/i.test(title) && /Emerald/i.test(title);
  });
  if (lvlTable) {
    for (const tr of rowsOf(lvlTable)) {
      const c = cells(tr);
      if (c.length < 7) continue; // skip header + description rows
      const lvlRaw = cellText(c[0]!);
      const move = cellText(c[1]!);
      if (!move || /Attack Name/i.test(move)) continue;
      levelUp.push({ level: /^\d+$/.test(lvlRaw) ? Number(lvlRaw) : null, move });
    }
  }
  const machine: PokemonRecord["learnset"]["machine"] = [];
  const tm = section("TM & HM");
  if (tm) {
    for (const tr of rowsOf(tm)) {
      const c = cells(tr);
      if (c.length < 7) continue;
      const mv = cellText(c[1]!);
      const code = cellText(c[0]!);
      if (/^(TM|HM)\d+/i.test(code) && mv) machine.push({ machine: code, move: mv });
    }
  }

  // --- Evolution chain (national numbers from anchor hrefs) -----------------
  const evoDex: number[] = [];
  const evo = section("Evolutionary Chain");
  if (evo) {
    evo.find("a[href]").each((_, a) => {
      const m = ($(a).attr("href") ?? "").match(/(\d{1,4})\.shtml/);
      if (m) {
        const n = Number(m[1]);
        if (n && !evoDex.includes(n)) evoDex.push(n);
      }
    });
  }

  const record: PokemonRecord = {
    slug: slugify(name),
    natdex,
    name,
    names,
    types,
    genderRatio,
    classification,
    heightM,
    weightKg,
    captureRate,
    baseEggSteps,
    eggGroups,
    abilities,
    baseStats,
    evolutionChain: [], // resolved from evoDex in run.ts
    flavorText,
    locations,
    learnset: { levelUp, machine },
    source: { url, scrapedAt: new Date().toISOString() },
  };
  return { record, evoDex };
}
