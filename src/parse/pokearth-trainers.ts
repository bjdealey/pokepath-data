// Extract Emerald rival / villain battles from a Serebii pokearth "3rd"
// location page. Trainers are grouped by document-order anchors; the
// `trainers-em` sections hold the Emerald-specific rosters. Pokearth trainer
// tables carry team + level (and a "<Starter> Chosen" variant label for the
// rival) but no movesets/items — those live only on the gym/elite pages.
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { trainerSlug } from "./trainers.ts";
import type { Trainer } from "../types.ts";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const monSlug = (name: string) =>
  name.toLowerCase().replace(/['.]/g, "").replace(/♀/g, "-f").replace(/♂/g, "-m").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const RIVAL = /\bPok.?mon Trainer\b.*\b(Brendan|May|Wally)\b|\b(Brendan|May|Wally)\b/;
const VILLAIN = /\b(Magma|Aqua|Maxie|Archie|Tabitha|Courtney|Matt|Shelly)\b/;

const PLACE_WORDS =
  /(city|town|hideout|pass|tunnel|woods|road|cavern|cave|institute|center|falls|island|forest|tower|frontier|league|underpass|hall)/g;

export function locationName(slug: string): string {
  const rm = slug.match(/^route(\d+)$/i);
  if (rm) return `Route ${rm[1]}`;
  return slug
    .toLowerCase()
    .replace(PLACE_WORDS, " $1")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseRouteTrainers(html: string, location: string): Trainer[] {
  const $ = cheerio.load(html);
  const out: Trainer[] = [];
  let section = "";

  $("a[name], table.trainer").each((_i, el) => {
    if (el.tagName === "a") {
      section = $(el).attr("name") || section;
      return;
    }
    if (section !== "trainers-em") return;
    if ($(el).parents("table.trainer").length) return; // top-level tables only

    const rows = $(el).find("tr").toArray();
    const cells = (r: Element) => $(r).children("td,th").toArray();
    const nameRow = rows[1];
    const spriteRow = rows[0];
    if (!nameRow || !spriteRow) return;

    const label = clean($(cells(nameRow)[0]).text());
    if (!label) return;
    const kind: Trainer["kind"] = RIVAL.test(label) ? "rival" : VILLAIN.test(label) ? "villain" : "trainer";

    const nameCells = cells(nameRow).slice(1); // drop leader column
    const spriteCells = cells(spriteRow).slice(1);
    const levelRow = rows.find((r) => cells(r).some((c) => /^Level \d+/.test(clean($(c).text()))));
    const levelCells = levelRow ? cells(levelRow).slice(-nameCells.length) : [];

    const team = nameCells
      .map((c, i) => {
        const name = clean($(c).text());
        const src = $(spriteCells[i]).find("img").attr("src") ?? "";
        const natdex = Number(src.match(/\/sprites\/\w+\/(\d+)\.png/i)?.[1] ?? 0);
        const level = Number(clean($(levelCells[i]).text()).match(/(\d+)/)?.[1] ?? 0);
        return { pokemon: monSlug(name), natdex, level };
      })
      .filter((p) => p.pokemon && p.level > 0);
    if (!team.length) return;

    const variant = rows.map((r) => clean($(r).text())).find((t) => /\bChosen\b/i.test(t))?.match(/(\w+)\s+Chosen/i)?.[0];

    out.push({ slug: trainerSlug(label), label, kind, location, locationName: locationName(location), variant, team });
  });

  return out;
}
