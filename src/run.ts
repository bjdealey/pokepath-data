// Scrape driver.  Usage:
//   node src/run.ts pokemon                 # default slice: Emerald opening (252-265)
//   node src/run.ts pokemon 1-386           # full national dex (Gen-3 pages)
//   node src/run.ts pokemon 252,255,258     # explicit list
//   node src/run.ts pokemon 1-151 --refresh # ignore cache
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fetchCached } from "./fetch.ts";
import { parsePokemon } from "./parse/pokemon.ts";
import { deriveEncounters } from "./derive/encounters.ts";
import type { GameSlug, PokemonRecord } from "./types.ts";

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
  for (const { record, evoDex } of parsed) {
    record.evolutionChain = evoDex.map((d) => byDex.get(d) ?? `#${d}`);
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
  const game = (arg ?? "emerald") as GameSlug;
  console.log(`▶ deriving ${game} encounters from pokemon locations…`);
  const r = deriveEncounters(game);
  console.log(`✔ ${r.locations} locations from ${r.contributing} pokemon → dataset/games/${game}/`);
  if (r.unparsed.length) {
    console.warn(`⚠ ${r.unparsed.length} route-like strings did not parse:`);
    r.unparsed.slice(0, 10).forEach((u) => console.warn(`  ${u}`));
  }
} else {
  console.error(`unknown entity "${entity}" — use "pokemon" or "encounters"`);
  process.exit(1);
}
