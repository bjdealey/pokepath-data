// Scrape driver.  Usage:
//   node src/run.ts pokemon                 # default slice: Emerald opening (252-265)
//   node src/run.ts pokemon 1-386           # full national dex (Gen-3 pages)
//   node src/run.ts pokemon 252,255,258     # explicit list
//   node src/run.ts pokemon 1-151 --refresh # ignore cache
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchCached } from "./fetch.ts";
import { parsePokemon } from "./parse/pokemon.ts";
import { scrapeEncounters } from "./scrape/encounters.ts";
import { scrapeItems } from "./scrape/items.ts";
import { scrapeMoves } from "./scrape/moves.ts";
import { scrapeItemdex } from "./scrape/itemdex.ts";
import { deriveLearnedBy } from "./derive/learnedby.ts";
import { deriveMachines } from "./derive/machines.ts";
import { deriveTypechart } from "./derive/typechart.ts";
import { scrapeTrainers } from "./scrape/trainers.ts";
import type { PokemonRecord } from "./types.ts";

const DATASET = fileURLToPath(new URL("../dataset/", import.meta.url));
const rsUrl = (n: number) => `https://www.serebii.net/pokedex-rs/${String(n).padStart(3, "0")}.shtml`;
const DEFAULT_SLICE = range(252, 265); // Treecko..Wurmple — the Emerald start

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
function parseDex(arg: string | undefined): number[] {
  if (!arg) return DEFAULT_SLICE;
  const out = new Set<number>();
  for (const part of arg.split(",")) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) range(Number(m[1]), Number(m[2])).forEach((n) => out.add(n));
    else if (/^\d+$/.test(part)) out.add(Number(part));
  }
  return [...out].sort((a, b) => a - b);
}

async function scrapePokemon(dexNums: number[], refresh: boolean) {
  const parsed = [];
  for (const n of dexNums) {
    const url = rsUrl(n);
    try {
      const html = await fetchCached(url, { refresh });
      const p = parsePokemon(html, url);
      if (!p.record.name) {
        console.warn(`  #${n}: no name parsed — skipped`);
        continue;
      }
      parsed.push(p);
      process.stdout.write(`  #${String(n).padStart(3, "0")} ${p.record.name} (${p.record.types.join("/")}) BST ${p.record.baseStats.total}\n`);
    } catch (err) {
      console.warn(`  #${n}: ${(err as Error).message}`);
    }
  }

  // Resolve evolution chains (national number -> slug) across this run.
  const byDex = new Map<number, string>();
  for (const { record } of parsed) byDex.set(record.natdex, record.slug);
  const slugOf = (d: number) => byDex.get(d) ?? `#${d}`;
  for (const { record, evoDex, evoEdges } of parsed) {
    record.evolutionChain = evoDex.map(slugOf);
    record.evolutions = evoEdges.map((e) => ({ from: slugOf(e.from), to: slugOf(e.to), method: e.method }));
  }

  // Emit one file per Pokémon + an index.
  const dir = `${DATASET}pokemon/`;
  await mkdir(dir, { recursive: true });
  const index: Array<Pick<PokemonRecord, "slug" | "natdex" | "name" | "types">> = [];
  for (const { record } of parsed) {
    await writeFile(`${dir}${record.slug}.json`, JSON.stringify(record, null, 2));
    index.push({ slug: record.slug, natdex: record.natdex, name: record.name, types: record.types });
  }
  index.sort((a, b) => a.natdex - b.natdex);
  await writeFile(`${dir}index.json`, JSON.stringify(index, null, 2));
  await mkdir(DATASET, { recursive: true });
  await writeFile(`${DATASET}meta.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "serebii.net (pokedex-rs)",
    counts: { pokemon: parsed.length },
  }, null, 2));

  console.log(`\n✔ wrote ${parsed.length} pokemon -> dataset/pokemon/`);
}

const [entity, arg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const refresh = process.argv.includes("--refresh");

if (!entity || entity === "pokemon") {
  const dex = parseDex(arg);
  console.log(`▶ scraping ${dex.length} pokemon (Gen-3 pages)…`);
  await scrapePokemon(dex, refresh);
} else if (entity === "encounters") {
  console.log(`▶ crawling Hoenn pokearth pages for Emerald encounters (mon + rate + level)…`);
  const r = await scrapeEncounters(refresh);
  console.log(`✔ ${r.pages} pages → ${r.locations} locations, ${r.encounters} encounters → dataset/games/emerald/`);
} else if (entity === "items") {
  console.log(`▶ crawling Hoenn pokearth pages for Emerald location items…`);
  const r = await scrapeItems(refresh);
  console.log(`✔ ${r.pages} pages → ${r.locations} locations, ${r.items} items → dataset/games/emerald/`);
} else if (entity === "itemdex") {
  console.log(`▶ scraping ItemDex definitions (effect + price) for Emerald items…`);
  const r = await scrapeItemdex(refresh);
  console.log(`✔ ${r.items} item definitions (of ${r.slugs}) → dataset/items/`);
} else if (entity === "moves") {
  const limit = arg && /^\d+$/.test(arg) ? Number(arg) : 0;
  console.log(`▶ scraping Gen-III moves${limit ? ` (first ${limit})` : ""}…`);
  const r = await scrapeMoves(refresh, limit);
  console.log(`✔ ${r.moves} moves (of ${r.discovered} discovered) → dataset/moves/`);
} else if (entity === "learnedby") {
  console.log(`▶ deriving move → Pokémon reverse index from learnsets…`);
  const r = deriveLearnedBy();
  console.log(`✔ ${r.withLearners}/${r.moves} moves have learners, ${r.totalLinks} links`);
  if (r.unmatched.length) console.warn(`⚠ ${r.unmatched.length} unmatched move names: ${r.unmatched.slice(0, 15).join(", ")}`);
} else if (entity === "machines") {
  console.log(`▶ deriving the TM/HM → move table from learnsets…`);
  const r = deriveMachines();
  console.log(`✔ ${r.machines} machines (${r.tms} TMs, ${r.hms} HMs) → dataset/machines.json`);
  if (r.unresolved.length) console.warn(`⚠ ${r.unresolved.length} unresolved move slugs: ${r.unresolved.join(", ")}`);
} else if (entity === "typechart") {
  console.log(`▶ deriving the Gen-3 type chart from Pokémon damage-taken…`);
  const r = deriveTypechart();
  console.log(`✔ ${r.resolved}/${r.types} type columns → dataset/typechart.json`);
  if (r.missing.length) console.warn(`⚠ unresolved types: ${r.missing.join(", ")}`);
} else if (entity === "trainers") {
  console.log(`▶ scraping all Emerald trainers (gym/elite + route) + story…`);
  const r = await scrapeTrainers(refresh);
  console.log(`✔ ${r.trainers} trainers ${JSON.stringify(r.byKind)} → dataset/games/emerald/`);
  console.log(`  story: ${r.milestones} milestones + ${r.locations} locations (inferred order)`);
} else {
  console.error(`unknown entity "${entity}" — use "pokemon", "moves", "learnedby", "machines", "typechart", "encounters", "items", "itemdex", or "trainers"`);
  process.exit(1);
}
