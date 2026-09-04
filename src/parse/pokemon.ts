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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Gen-3 trade-with-item evolutions, keyed by the item text in the method image name.
const TRADE_ITEMS: Record<string, string> = {
  kingsrock: "King's Rock",
  dragonscale: "Dragon Scale",
  metalcoat: "Metal Coat",
  upgrade: "Up-Grade",
  deepseatooth: "Deep Sea Tooth",
  deepseascale: "Deep Sea Scale",
};

/** Turn an evolution-method image filename into human-readable text. */
export function decodeEvoMethod(fileName: string): string {
  const f = fileName.replace(/\.(png|gif)$/i, "").toLowerCase().replace(/^eevee/, "");
  let m: RegExpMatchArray | null;
  if ((m = f.match(/^l(\d+)$/))) return `Level ${m[1]}`;
  if (f.startsWith("levelpokeblock")) return "Level up with high Beauty";
  if ((m = f.match(/^levelpokeball(\d+)/))) return `Level ${m[1]} (empty party slot + spare Poké Ball → Shedinja)`;
  if ((m = f.match(/^p\d+level(\d+)/))) return `Level ${m[1]} (by personality value)`;
  if ((m = f.match(/(fire|water|thunder|leaf|moon|sun)stone/))) return `${cap(m[1]!)} Stone`;
  if (f.startsWith("happiness")) return `High Friendship${f.includes("day") ? " (Daytime)" : f.includes("night") ? " (Nighttime)" : ""}`;
  if (f.startsWith("beauty")) return "High Beauty";
  if (f.startsWith("trade")) {
    const item = f.replace(/^trade/, "").replace(/[^a-z]/g, "");
    return item ? `Trade holding ${TRADE_ITEMS[item] ?? cap(item)}` : "Trade";
  }
  return cap(f); // fallback: raw filename
}

type EvoCell = { type: "pkmn"; dex: number } | { type: "method"; img: string };
export interface EvoEdge { from: number; to: number; method: string }

/** Parse the "Evolutionary Chain" table into edges (dex numbers + method).
 * Handles linear chains, the Eevee-style vertical fan, and offset branches. */
export function parseEvolutions($: cheerio.CheerioAPI, evoTable: Cheerio<Element> | undefined): EvoEdge[] {
  if (!evoTable) return [];
  const classify = (cell: Element): EvoCell | null => {
    const $c = $(cell);
    const cls = $c.attr("class") ?? "";
    if (cls.includes("pkmn")) {
      const ref = $c.find("a[href*='pokedex']").attr("href") ?? $c.find("img").attr("src") ?? "";
      const dex = ref.match(/(\d{1,4})\.(?:shtml|png)/)?.[1];
      return dex ? { type: "pkmn", dex: Number(dex) } : null;
    }
    const img = $c.find("img").attr("src");
    if (img && !/foo/.test(cls)) return { type: "method", img: img.split("/").pop() ?? "" };
    return null;
  };

  const rows = evoTable
    .find("tr")
    .toArray()
    .map((r) => $(r).children("td,th").toArray().map(classify).filter((c): c is EvoCell => c !== null))
    .filter((r) => r.length > 0);

  const base = rows.flat().find((c) => c.type === "pkmn");
  if (!base || base.type !== "pkmn") return [];

  const edges: EvoEdge[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i]!;
    const nextRow = rows[i + 1];
    // Vertical fan (Eevee): a row of only methods, then a row of only Pokémon.
    if (cells.every((c) => c.type === "method") && nextRow?.every((c) => c.type === "pkmn")) {
      cells.forEach((mCell, j) => {
        const target = nextRow[j];
        if (mCell.type === "method" && target?.type === "pkmn") edges.push({ from: base.dex, to: target.dex, method: decodeEvoMethod(mCell.img) });
      });
      i++; // consumed the Pokémon row
      continue;
    }
    // Mixed row: a row starting with a method is an offset branch off the base.
    let src = cells[0]!.type === "method" ? base.dex : 0;
    let pending: string | null = null;
    for (const c of cells) {
      if (c.type === "pkmn") {
        if (pending !== null) {
          edges.push({ from: src, to: c.dex, method: decodeEvoMethod(pending) });
          pending = null;
        }
        src = c.dex;
      } else {
        pending = c.img;
      }
    }
  }
  return edges;
}

export interface ParsedPokemon {
  record: PokemonRecord;
  evoDex: number[]; // national numbers in the evolution chain; resolved to slugs later
  evoEdges: EvoEdge[]; // evolution steps (dex numbers); resolved to slugs later
}

export function parsePokemon(html: string, url: string): ParsedPokemon {
  const $ = cheerio.load(html);
  $("br").replaceWith(" "); // Serebii separates sentences/abilities with <br>; keep text from gluing together

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
        // description row that lists BOTH as "Name: <desc>". Split the combined
        // text by the ability-name prefixes so each ability gets only its own
        // description (and drop the redundant "Name:" prefix).
        // Two abilities share one description row that reads "Name1: <desc1>
        // Name2: <desc2>". Give each ability only its own slice, keyed off the
        // ability names (the reliable delimiter — capitalized words appear mid-
        // description too). Only split when every name is actually present as a
        // "Name:" prefix; otherwise (single ability, or a Serebii name typo that
        // won't match) keep the shared text rather than mis-slicing.
        const combined = infoTrs[i + 1] ? cellText(cells(infoTrs[i + 1]!)[0]!) : "";
        const names = abilityName
          .split(/\s*&\s*|\s+or\s+/)
          .map((a) => a.trim())
          .filter(Boolean)
          .map((a) => (a === "Chrlorophyll" ? "Chlorophyll" : a)); // Serebii misspells Chlorophyll in the Nuzleaf line's name cell
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const prefix = (a: string) => new RegExp(esc(a) + "\\s*:", "i");
        const splittable = names.length > 1 && names.every((a) => prefix(a).test(combined));
        for (const a of names) {
          let description: string | undefined = combined || undefined;
          if (splittable) {
            let rest = combined.slice(combined.search(prefix(a))).replace(new RegExp("^" + esc(a) + "\\s*:\\s*", "i"), "");
            for (const other of names) {
              if (other === a) continue;
              const cut = rest.search(prefix(other));
              if (cut >= 0) rest = rest.slice(0, cut);
            }
            description = clean(rest) || undefined;
          }
          abilities.push({ name: a, description });
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
    // Legendaries/babies/etc. have no breeding group — Serebii shows "Cannot
    // Breed" instead of a group name. Capture that rather than leaving it blank.
    if (!eggGroups.length && /Cannot Breed/i.test(eg.text())) eggGroups.push("Cannot Breed");
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
  const lvlTitle = (t: Cheerio<Element>) => clean(t.find("tr").first().children().first().text());
  // Prefer the Emerald-scoped level-up table; fall back to the first "Level Up"
  // table for mons whose tables are titled per-forme, not per-game (e.g. Deoxys).
  const lvlTable =
    tables.find((t) => /Level Up/i.test(lvlTitle(t)) && /Emerald/i.test(lvlTitle(t))) ??
    tables.find((t) => /Level Up/i.test(lvlTitle(t)));
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

  // Egg moves + Emerald-applicable tutor moves (move names from the 6-cell rows;
  // header row's first cell is "Attack Name", description rows have one cell).
  const moveNamesFrom = (t: Cheerio<Element> | undefined): string[] => {
    const out: string[] = [];
    for (const tr of rowsOf(t)) {
      const c = cells(tr);
      if (c.length < 6) continue;
      const mv = cellText(c[0]!);
      if (mv && !/Attack Name/i.test(mv)) out.push(mv);
    }
    return out;
  };
  const egg = moveNamesFrom(section("Egg Moves"));
  const tutorSet = new Set<string>();
  for (const t of tables) {
    const title = clean(t.find("tr").first().children().first().text());
    if (/Tutor/i.test(title) && /Emerald/i.test(title)) for (const mv of moveNamesFrom(t)) tutorSet.add(mv);
  }
  const tutor = [...tutorSet];

  // --- Damage Taken: type effectiveness against this Pokémon ----------------
  const VALID_TYPES = new Set([
    "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
    "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel",
  ]);
  const damageTaken: Record<string, number> = {};
  const dtTable = section("Damage Taken");
  if (dtTable) {
    const rows = rowsOf(dtTable);
    const typeRow = rows.find((r) => cells(r).filter((c) => $(c).find("img").length).length > 10);
    const multRow = rows.find((r) => cells(r).some((c) => /^\*/.test(cellText(c))));
    if (typeRow && multRow) {
      const typeCells = cells(typeRow);
      const multCells = cells(multRow);
      typeCells.forEach((tc, i) => {
        const t = ($(tc).find("img").attr("src") ?? "").split("/").pop()?.replace(/\d*\.gif$/i, "").toLowerCase() ?? "";
        const mult = Number(cellText(multCells[i] ?? tc).replace(/[*×]/g, ""));
        if (VALID_TYPES.has(t) && Number.isFinite(mult) && mult !== 1) damageTaken[t] = mult;
      });
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
  const evoEdges = parseEvolutions($, evo);

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
    evolutions: [], // resolved from evoEdges in run.ts
    damageTaken,
    flavorText,
    locations,
    learnset: { levelUp, machine, egg, tutor },
    source: { url, scrapedAt: new Date().toISOString() },
  };
  return { record, evoDex, evoEdges };
}
