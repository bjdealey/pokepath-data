// Scrape the 25 natures from Serebii's natures page (/games/natures.shtml) —
// each raises one stat 10% and lowers another; five are neutral ("None"). This
// gives the natures collection a Serebii `source`, like every other record.
// The page lays natures out two per row, each occupying 7 cells:
//   name(+JP) | berry | increased | decreased | likes | dislikes | num
// so flattening the <td>s in document order, increased = name+2, decreased =
// name+3. Emits dataset/gen3/natures.json.
import { writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import { GEN_DIR as DATASET } from "../paths.ts";
import { fetchCached } from "../fetch.ts";
import type { NatureRecord } from "../types.ts";

const URL = "https://www.serebii.net/games/natures.shtml";
const STAT: Record<string, string> = {
  attack: "attack",
  defense: "defense",
  "special attack": "spAttack",
  "special defense": "spDefense",
  speed: "speed",
};
// The fixed 25 names — used only to locate the nature rows among the page's
// cells (their +/- values are read from Serebii) and to assert we got them all.
const NAMES = new Set(
  ["Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed", "Impish", "Lax", "Timid", "Hasty", "Serious", "Jolly", "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash", "Calm", "Gentle", "Sassy", "Careful", "Quirky"].map((n) => n.toLowerCase()),
);

export async function scrapeNatures(refresh = false) {
  const $ = cheerio.load(await fetchCached(URL, { refresh }));
  $("br").replaceWith(" ");
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const cells = $("td").toArray().map((c) => clean($(c).text()));

  const scrapedAt = new Date().toISOString();
  const seen = new Set<string>();
  const records: NatureRecord[] = [];
  for (let i = 0; i < cells.length; i++) {
    // Strip diacritics first (Serebii writes "Naïve") then take the leading word,
    // dropping the JP name that follows it.
    const ascii = cells[i]!.normalize("NFD").replace(/\p{Mn}/gu, ""); // drop combining marks
    const name = (ascii.match(/^[A-Za-z]+/) ?? [""])[0];
    const slug = name.toLowerCase();
    if (!NAMES.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    // "None" (neutral) and anything non-stat map to null.
    const increased = STAT[(cells[i + 2] ?? "").toLowerCase()] ?? null;
    const decreased = STAT[(cells[i + 3] ?? "").toLowerCase()] ?? null;
    records.push({ slug, name, increased, decreased, source: { url: URL, scrapedAt } });
  }
  records.sort((a, b) => a.name.localeCompare(b.name));

  await writeFile(`${DATASET}natures.json`, JSON.stringify(records, null, 2));
  return { natures: records.length, neutral: records.filter((r) => !r.increased && !r.decreased).length, missing: [...NAMES].filter((n) => !seen.has(n)) };
}
