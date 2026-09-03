// Parse a Gen-III AttackDex page (/attackdex/<slug>.shtml) into a MoveRecord.
// The data lives in a `table.dextab` containing "Base Power"; fields are found
// by their label rows (robust to layout shifts).
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { MoveRecord } from "../types.ts";

// Gen-3 physical/special is decided by type, not per move.
const PHYSICAL = new Set(["normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel"]);

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const numOrNull = (s: string): number | null => {
  if (!/\d/.test(s)) return null;
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const typeFromImg = (src: string | undefined) => (src ?? "").match(/type\/([a-z]+)\.gif/i)?.[1]?.toLowerCase();

export function parseMove(html: string, url: string): MoveRecord {
  const $ = cheerio.load(html);
  const table = $("table.dextab").toArray().find((t) => /Base Power/i.test($(t).text()));
  const rows = table ? $(table).find("tr").toArray() : [];
  const cells = (r: Element) => $(r).children("td,th").toArray();
  const rowText = (r: Element) => clean($(r).text());
  const findRow = (re: RegExp) => rows.find((r) => re.test(rowText(r)));
  const after = (r: Element | undefined) => (r ? rows[rows.indexOf(r) + 1] : undefined);

  // Name / Battle Type / Contest Type
  const nameRow = after(findRow(/Attack Name/i));
  const nameCells = nameRow ? cells(nameRow) : [];
  const name = clean($(nameCells[0]).text());
  const type = typeFromImg($(nameCells[1]).find("img").attr("src")) ?? "";
  const contestType = typeFromImg($(nameCells[2]).find("img").attr("src"));

  // Power Points / Base Power / Accuracy
  const statRow = after(findRow(/Base Power/i));
  const statCells = statRow ? cells(statRow) : [];
  const pp = numOrNull(clean($(statCells[0]).text())) ?? 0;
  // Serebii prints 0 for status moves' power/accuracy — treat 0 as "not applicable".
  const rawPower = numOrNull(clean($(statCells[1]).text()));
  const rawAccuracy = numOrNull(clean($(statCells[2]).text()));
  const power = rawPower && rawPower > 0 ? rawPower : null;
  const accuracy = rawAccuracy && rawAccuracy > 0 ? rawAccuracy : null;

  // Effects
  const effect = clean($(findRow(/Battle Effect/i)).text()).replace(/^Battle Effect:\s*/i, "");
  const secRow = findRow(/Secondary Effect/i);
  const secText = secRow ? clean($(cells(secRow)[0]).text()).replace(/^Secondary Effect:\s*/i, "") : "";
  const secondaryEffect = !secText || /^no effect/i.test(secText) ? undefined : secText;
  const effectRate = secRow ? numOrNull(rowText(secRow).match(/Effect Rate:\s*([\d-]+)/)?.[1] ?? "") : null;

  const category = power === null ? "status" : PHYSICAL.has(type) ? "physical" : "special";
  const slug = url.match(/\/attackdex\/([a-z0-9-]+)\.shtml/i)?.[1] ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return { slug, name, type, category, power, accuracy, pp, effect, secondaryEffect, effectRate, contestType, source: { url, scrapedAt: new Date().toISOString() } };
}
