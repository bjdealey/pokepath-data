// Extract route / rival / villain battles from a Serebii pokearth "3rd"
// location page, for the requested game. Trainers are grouped by document-order
// anchors; `trainers-em` holds the Emerald rosters and `trainers-rs` the Ruby &
// Sapphire rosters (which share one section). Pokearth trainer tables carry team
// + level (and a "<Starter> Chosen" variant label for the rival) but no
// movesets/items — those live only on the gym/elite pages.
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { trainerSlug } from "./trainers.ts";
import type { Trainer } from "../types.ts";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const monSlug = (name: string) =>
  name.toLowerCase().replace(/['.]/g, "").replace(/♀/g, "-f").replace(/♂/g, "-m").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const RIVAL = /\bPok.?mon Trainer\b.*\b(Brendan|May|Wally)\b|\b(Brendan|May|Wally)\b/;
const VILLAIN = /\b(Magma|Aqua|Maxie|Archie|Tabitha|Courtney|Matt|Shelly)\b/;
// Pokearth city pages re-list gym leaders / E4 / champion (as escalating rematch
// tiers, without movesets). Reclassify to their real kind and strip the honorific
// so their identity merges with the authoritative gym/elite-page rows.
const MARQUEE = /^(Gym Leader|Elite Four|Champion)\s+(.+)$/i;

const PLACE_WORDS =
  /(city|town|hideout|pass|tunnel|woods|road|cavern|cave|institute|center|falls|island|forest|tower|frontier|league|underpass|hall)/g;

// Names the slug→name heuristic can't recover: irregular structure ("cave OF
// origin"), a prefix word ("new mauville"), a suffix PLACE_WORDS doesn't know
// ("pillar", "tomb", "ruins", "path", "zone", "slab", "ship"), or an initialism
// ("S.S. Tidal"). Serebii doesn't give these a clean display name anywhere in the
// scraped pages, so curate them here — the one place slug→name is decided.
export const LOCATION_NAMES: Record<string, string> = {
  abandonedship: "Abandoned Ship",
  ancienttomb: "Ancient Tomb",
  caveoforigin: "Cave of Origin",
  desertruins: "Desert Ruins",
  fierypath: "Fiery Path",
  newmauville: "New Mauville",
  safarizone: "Safari Zone",
  scorchedslab: "Scorched Slab",
  skypillar: "Sky Pillar",
  sstidal: "S.S. Tidal",
};

export function locationName(slug: string): string {
  if (LOCATION_NAMES[slug]) return LOCATION_NAMES[slug];
  const rm = slug.match(/^route(\d+)$/i);
  if (rm) return `Route ${rm[1]}`;
  return slug
    .toLowerCase()
    .replace(PLACE_WORDS, " $1")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseRouteTrainers(html: string, location: string, game = "emerald"): Trainer[] {
  const $ = cheerio.load(html);
  const out: Trainer[] = [];
  let section = "";
  // Emerald route trainers are in `trainers-em`; Ruby & Sapphire share `trainers-rs`.
  const want = game === "emerald" ? "trainers-em" : "trainers-rs";

  $("a[name], table.trainer").each((_i, el) => {
    if (el.tagName === "a") {
      section = $(el).attr("name") || section;
      return;
    }
    if (section !== want) return;
    if ($(el).parents("table.trainer").length) return; // top-level tables only

    const rows = $(el).find("tr").toArray();
    const cells = (r: Element) => $(r).children("td,th").toArray();
    const nameRow = rows[1];
    const spriteRow = rows[0];
    if (!nameRow || !spriteRow) return;

    const label = clean($(cells(nameRow)[0]).text());
    if (!label) return;
    const mq = label.match(MARQUEE);
    const kind: Trainer["kind"] = mq
      ? (/^champion$/i.test(mq[1]!) ? "champion" : /^elite four$/i.test(mq[1]!) ? "elite-four" : "gym-leader")
      : RIVAL.test(label) ? "rival" : VILLAIN.test(label) ? "villain" : "trainer";
    const identity = mq ? mq[2]! : label; // honorific stripped → merges with gym/elite-page row

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

    const slug = trainerSlug(identity);
    out.push({ slug, trainer: slug, label, kind, location, variant, team });
  });

  return out;
}
