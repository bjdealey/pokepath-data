// Parse Serebii's Emerald gym / Elite Four pages.
//   - table.trainer  → each trainer's roster (leader col + N Pokémon cols;
//     Pokémon-only rows omit the leader col, so align columns from the right).
//   - table.tab text → progression metadata (city, badge, TM, and the field
//     move each badge unlocks, stated in the "Method:" prose).
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { TrainerPokemon } from "../types.ts";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// The Emerald gym/elite pages print a few post-Gen-3 move names that don't match
// the Gen-III AttackDex, so a trainer's move can't be joined to a move record.
// Map them back to the Gen-3 name (which normalizes to the move slug). Keyed by
// lowercased display text.
export const TRAINER_MOVE_ALIASES: Record<string, string> = {
  "feint attack": "Faint Attack", // renamed in Gen 6; Gen-3 move is Faint Attack (slug faintattack)
};
export const aliasMoveName = (raw: string): string => TRAINER_MOVE_ALIASES[raw.toLowerCase()] ?? raw;

export function trainerSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/\s*&\s*/g, "-and-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface Roster {
  name: string;
  team: TrainerPokemon[];
}

export function parseTrainerRosters(html: string): Roster[] {
  const $ = cheerio.load(html);
  const out: Roster[] = [];

  $("table.trainer").each((_, t) => {
    const rows = $(t).find("tr").toArray();
    const cells = (r: Element) => $(r).children("td,th").toArray();
    const rowText = (r: Element) => clean($(r).text());

    const spriteIdx = rows.findIndex((r) => $(r).find('img[src*="/sprites/"], img[src*="/trainers/"]').length > 0);
    if (spriteIdx < 0) return;
    const spriteRow = rows[spriteIdx]!;
    const nameRow = rows[spriteIdx + 1];
    const levelRow = rows.find((r) => cells(r).some((c) => /^Level \d+/.test(clean($(c).text()))));
    const attackRow = rows.find((r) => /Attacks:/i.test(rowText(r)));
    const itemRow = rows.find((r) => /Hold Item/i.test(rowText(r)));
    if (!nameRow || !attackRow) return;

    const attackCells = cells(attackRow);
    const count = attackCells.length; // Pokémon-only row → true team size
    // Rightmost `count` cells of a row are the Pokémon columns (leader is leftmost).
    const right = (r: Element | undefined, i: number) => {
      if (!r) return undefined;
      const c = cells(r);
      return c[c.length - count + i];
    };

    const leaderName = clean($(cells(nameRow)[0]).text());
    const team: TrainerPokemon[] = [];
    for (let i = 0; i < count; i++) {
      const name = clean($(right(nameRow, i)).text());
      if (!name) continue;
      const src = $(right(spriteRow, i)).find("img").attr("src") ?? "";
      const natdex = Number(src.match(/\/sprites\/\w+\/(\d+)\.png/i)?.[1] ?? 0);
      const level = Number(clean($(right(levelRow, i)).text()).match(/(\d+)/)?.[1] ?? 0);
      const moves = $(attackCells[i]!).find("a").map((_i, a) => aliasMoveName(clean($(a).text()))).get();
      const itemCell = itemRow ? cells(itemRow)[i] : undefined;
      const itemText = itemCell ? clean($(itemCell).text()).replace(/^Hold Item:\s*/i, "") : "";
      const heldItem = !itemText || /no item/i.test(itemText) ? null : itemText;
      team.push({ pokemon: trainerSlug(name), natdex, level, moves, heldItem });
    }
    out.push({ name: leaderName, team });
  });

  return out;
}

export interface ProgressionMeta {
  order: number;
  name: string;
  city?: string;
  location?: string;
  specialty?: string;
  badge?: string;
  tmReward?: string;
  fieldMove?: string;
}

const FIELD_MOVE = /\b(Cut|Flash|Rock Smash|Strength|Surf|Fly|Dive|Waterfall|Dig)\b/i;

export function parseGymProgression(html: string): ProgressionMeta[] {
  const text = clean(cheerio.load(html)("body").text());
  const out: ProgressionMeta[] = [];
  const re =
    /Gym #(\d+):\s*(.+?)\s*Location:\s*(.+?)\s*(?:Gym )?Leader:\s*(.+?)\s*Specialty:\s*([A-Za-z]+)-type\s*Reward:\s*(.+?)\s*Method:\s*(.+?)(?=Gym #\d+:|Elite Four|$)/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [, num, city, location, leader, specialty, reward, method] = m;
    const prose = method!.split(/Battle Type/i)[0]!; // prose only — excludes roster movesets
    out.push({
      order: Number(num),
      name: clean(leader!),
      city: clean(city!),
      location: clean(location!),
      specialty: specialty!,
      badge: reward!.match(/(.+? Badge)/)?.[1]?.trim(),
      tmReward: reward!.match(/(?:TM|HM)\d+/)?.[0],
      fieldMove: prose.match(FIELD_MOVE)?.[1],
    });
  }
  return out;
}

export function parseEliteProgression(html: string): ProgressionMeta[] {
  const text = clean(cheerio.load(html)("body").text());
  const out: ProgressionMeta[] = [];
  const re =
    /Elite Four #(\d+):\s*(.+?)\s*Member:\s*(.+?)\s*Specialty:\s*([A-Za-z]+)-type/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [, num, , member, specialty] = m;
    out.push({ order: Number(num), name: clean(member!), specialty: specialty! });
  }
  return out;
}
