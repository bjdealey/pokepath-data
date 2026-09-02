// Parse the item tables from a Serebii pokearth "3rd" page. Each item table has
// a "Picture | Item | Method" header; rows give the item (an itemdex link) and
// how it is obtained (Floor = on the ground, Itemfinder = hidden, …).
import * as cheerio from "cheerio";
import type { LocationItem } from "../types.ts";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function parseItems(html: string): LocationItem[] {
  const $ = cheerio.load(html);
  const out: LocationItem[] = [];
  const seen = new Set<string>();

  $("table").each((_i, t) => {
    const $t = $(t);
    const header = $t.find("tr").first().children().map((_c, c) => clean($(c).text())).get();
    if (!(header.includes("Item") && header.includes("Method"))) return;

    $t.find("tr").slice(1).each((_r, r) => {
      // Each row has two itemdex links (sprite image + name); take the named one.
      const named = $(r)
        .find("a[href*='itemdex']")
        .toArray()
        .map((a) => ({ text: clean($(a).text()), href: $(a).attr("href") ?? "" }))
        .find((l) => l.text);
      if (!named) return;
      const cells = $(r).children().toArray();
      const method = clean($(cells[cells.length - 1]).text());
      const slug = named.href.match(/itemdex\/([a-z0-9-]+)\.shtml/i)?.[1] ?? slugify(named.text);
      const key = `${slug}|${method}`;
      if (seen.has(key)) return; // de-dupe repeats / nested matches
      seen.add(key);
      out.push({ item: named.text, slug, method });
    });
  });

  return out;
}
