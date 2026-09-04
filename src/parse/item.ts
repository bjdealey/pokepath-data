// Parse a Serebii ItemDex page (/itemdex/<slug>.shtml) into an ItemRecord.
// Fields: Item Type (category), In-Depth Effect, and Purchase/Sell price.
import * as cheerio from "cheerio";
import type { ItemRecord } from "../types.ts";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function parseItem(html: string, url: string): ItemRecord {
  const $ = cheerio.load(html);
  $("br").replaceWith(" "); // Serebii separates sentences with <br>; keep them from gluing together


  const name = clean($("title").text()).replace(/^Serebii\.net ItemDex\s*-\s*/i, "");

  // Category: the "Item Type" column — items can have two types (e.g. a hold
  // item that's also evolutionary), each its own link, so join them.
  let category = "";
  $("table.dextable").each((_i, t) => {
    const headers = $(t).find("tr").first().children().map((_c, c) => clean($(c).text())).get();
    const idx = headers.findIndex((h) => /Item Type/i.test(h));
    if (idx >= 0) {
      const cell = $(t).find("tr").eq(1).children().eq(idx);
      const links = cell.find("a").map((_c, a) => clean($(a).text())).get();
      category = links.length ? links.join(" / ") : clean(cell.text());
    }
  });

  // Effect: prefer "In-Depth Effect"; berries (and a few others) don't have one,
  // so fall back to the first Flavour Text entry (its td.fooinfo cell).
  let effect = "";
  $("table.dextable").each((_i, t) => {
    const title = clean($(t).find("tr").first().children().first().text());
    // The effect prose lives in the section's first `td.fooinfo` cell. That cell
    // can embed nested data tables (e.g. a fossil's revived-Pokémon level/OT/
    // attacks), so strip those before reading its text.
    if (/In-?Depth Effect/i.test(title)) {
      const cell = $(t).find("td.fooinfo").first().clone();
      cell.find("table").remove();
      effect = clean(cell.text());
    }
  });
  if (!effect) {
    $("table.dextable").each((_i, t) => {
      const title = clean($(t).find("tr").first().children().first().text());
      if (/Flavou?r Text/i.test(title) && !effect) effect = clean($(t).find("tr").eq(1).find("td.fooinfo").first().text());
    });
  }

  const body = clean($("body").text());
  const price = Number(body.match(/Purchase Price:\s*(\d+)/i)?.[1] ?? "") || null;
  const sellPrice = Number(body.match(/Sell Price:\s*(\d+)/i)?.[1] ?? "") || null;
  const slug = url.match(/\/itemdex\/([a-z0-9-]+)\.shtml/i)?.[1] ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return { slug, name, category, effect, price, sellPrice, source: { url, scrapedAt: new Date().toISOString() } };
}
