// Dev tool: dump the table structure of a cached Serebii page so parsers can be
// written against the real HTML. Usage: node src/inspect.ts <html-file> [selector]
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";

const file = process.argv[2];
if (!file) {
  console.error("usage: node src/inspect.ts <html-file> [selector=table.dextable]");
  process.exit(1);
}
const sel = process.argv[3] ?? "table.dextable";
const $ = cheerio.load(readFileSync(file, "utf8"));
const tables = $(sel);
console.log(`# "${sel}": ${tables.length} matches in ${file}\n`);

tables.each((ti, t) => {
  const rows = $(t).find("tr");
  console.log(`=== table[${ti}]  rows=${rows.length} ===`);
  rows.slice(0, 14).each((ri, r) => {
    const cells = $(r)
      .children("td,th")
      .map((_, c) => {
        const cls = $(c).attr("class") ?? "-";
        const span = $(c).attr("colspan");
        const txt = $(c).text().replace(/\s+/g, " ").trim().slice(0, 44);
        return `[${cls}${span ? `x${span}` : ""}]${txt}`;
      })
      .get();
    console.log(`  r${ri}(${cells.length}): ${cells.join(" ")}`);
  });
  if (rows.length > 14) console.log(`  ...+${rows.length - 14} rows`);
  console.log("");
});
