// Scrape driver.  Usage:
//   node src/run.ts pokemon                 # default slice: Emerald opening (252-265)
//   node src/run.ts pokemon 1-386           # full national dex (Gen-3 pages)
//   node src/run.ts pokemon 252,255,258     # explicit list
//   node src/run.ts pokemon 1-151 --refresh # ignore cache
import { mkdir, writeFile } from "node:fs/promises";
import { GEN, GEN_DIR as DATASET } from "./paths.ts";
import { fetchCached } from "./fetch.ts";
import { parsePokemon } from "./parse/pokemon.ts";
import { scrapeEncounters } from "./scrape/encounters.ts";
import { scrapeItems } from "./scrape/items.ts";
import { scrapeConnectivity } from "./scrape/connectivity.ts";
import { scrapeMoves } from "./scrape/moves.ts";
import { scrapeItemdex } from "./scrape/itemdex.ts";
import { scrapeGifts } from "./scrape/gifts.ts";
import { deriveLearnedBy } from "./derive/learnedby.ts";
import { deriveItemLinks } from "./derive/itemlinks.ts";
import { deriveMachines } from "./derive/machines.ts";
import { deriveTypechart } from "./derive/typechart.ts";
import { deriveLegendaries } from "./derive/legendaries.ts";
import { deriveAbilities } from "./derive/abilities.ts";
import { deriveLocations } from "./derive/locations.ts";
import { deriveStoryPath } from "./derive/storypath.ts";
import { deriveNatures } from "./derive/natures.ts";
import { deriveObtainability } from "./derive/obtainability.ts";
import { deriveEvTraining } from "./derive/evtraining.ts";
import { deriveShiny } from "./derive/shiny.ts";
import { deriveManifest } from "./derive/manifest.ts";
import { scrapeTrainers } from "./scrape/trainers.ts";
import { scrapeTrades } from "./scrape/trades.ts";
import type { PokemonRecord } from "./types.ts";

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

  console.log(`\n✔ wrote ${parsed.length} pokemon -> dataset/${GEN}/pokemon/  (run \`manifest\` to refresh dataset/manifest.json)`);
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
  console.log(`✔ ${r.pages} pages → ${r.locations} locations, ${r.encounters} encounters → dataset/gen3/games/emerald/`);
} else if (entity === "items") {
  console.log(`▶ crawling Hoenn pokearth pages for Emerald location items…`);
  const r = await scrapeItems(refresh);
  console.log(`✔ ${r.pages} pages → ${r.locations} locations, ${r.items} items → dataset/gen3/games/emerald/`);
} else if (entity === "itemdex") {
  console.log(`▶ scraping ItemDex definitions (effect + price) for Emerald items…`);
  const r = await scrapeItemdex(refresh);
  console.log(`✔ ${r.items} item definitions (of ${r.slugs}) → dataset/gen3/items/`);
} else if (entity === "itemlinks") {
  console.log(`▶ deriving item reverse-indexes (heldBy + foundAt)…`);
  const r = deriveItemLinks();
  console.log(`✔ ${r.withHeldBy} items held by wild Pokémon, ${r.withFoundAt} found at locations (of ${r.items}) → dataset/gen3/items/`);
  if (r.unmatchedHeld.length) console.warn(`⚠ ${r.unmatchedHeld.length} held item name(s) with no ItemDex record: ${r.unmatchedHeld.join(", ")}`);
} else if (entity === "moves") {
  const limit = arg && /^\d+$/.test(arg) ? Number(arg) : 0;
  console.log(`▶ scraping Gen-III moves${limit ? ` (first ${limit})` : ""}…`);
  const r = await scrapeMoves(refresh, limit);
  console.log(`✔ ${r.moves} moves (of ${r.discovered} discovered) → dataset/gen3/moves/`);
} else if (entity === "learnedby") {
  console.log(`▶ deriving move → Pokémon reverse index from learnsets…`);
  const r = deriveLearnedBy();
  console.log(`✔ ${r.withLearners}/${r.moves} moves have learners, ${r.totalLinks} links`);
  if (r.unmatched.length) console.warn(`⚠ ${r.unmatched.length} unmatched move names: ${r.unmatched.slice(0, 15).join(", ")}`);
} else if (entity === "machines") {
  console.log(`▶ deriving the TM/HM → move table from learnsets…`);
  const r = deriveMachines();
  console.log(`✔ ${r.machines} machines (${r.tms} TMs, ${r.hms} HMs) → dataset/gen3/machines.json`);
  if (r.unresolved.length) console.warn(`⚠ ${r.unresolved.length} unresolved move slugs: ${r.unresolved.join(", ")}`);
} else if (entity === "typechart") {
  console.log(`▶ deriving the Gen-3 type chart from Pokémon damage-taken…`);
  const r = deriveTypechart();
  console.log(`✔ ${r.resolved}/${r.types} type columns → dataset/gen3/typechart.json`);
  if (r.missing.length) console.warn(`⚠ unresolved types: ${r.missing.join(", ")}`);
} else if (entity === "connectivity") {
  console.log(`▶ crawling pokearth exits to build the Hoenn location graph…`);
  const r = await scrapeConnectivity(refresh);
  console.log(`✔ ${r.locations} locations, ${r.edges} exit edges → dataset/gen3/games/emerald/connections.json`);
  if (r.dangling.length) console.warn(`⚠ ${r.dangling.length} exits point to un-crawled locations: ${r.dangling.slice(0, 10).join(", ")}`);
} else if (entity === "trainers") {
  console.log(`▶ scraping all Emerald trainers (gym/elite + route) + story…`);
  const r = await scrapeTrainers(refresh);
  console.log(`✔ ${r.trainers} trainers ${JSON.stringify(r.byKind)} → dataset/gen3/games/emerald/`);
  console.log(`  story: ${r.milestones} milestones + ${r.locations} locations + ${r.criticalPath}-beat critical path (inferred order)`);
  if (r.unresolvedMoves.length) console.warn(`⚠ ${r.unresolvedMoves.length} trainer move(s) don't match a move record: ${r.unresolvedMoves.join(", ")}`);
} else if (entity === "gifts") {
  console.log(`▶ parsing pokearth gift tables (starter + gifts) for Emerald…`);
  const r = await scrapeGifts(refresh);
  console.log(`✔ ${r.gifts} gift/starter Pokémon ${JSON.stringify(r.byMethod)} → dataset/gen3/games/emerald/gifts.json`);
} else if (entity === "abilities") {
  console.log(`▶ deriving the Gen-3 abilities collection from Pokémon ability text…`);
  const r = deriveAbilities();
  console.log(`✔ ${r.abilities} abilities (${r.withEffect} with effect) → dataset/gen3/abilities/  (normalized ${r.renamed} pokemon ability names)`);
} else if (entity === "legendaries") {
  console.log(`▶ deriving catchable legendaries from Pokémon Emerald locations…`);
  const r = deriveLegendaries();
  console.log(`✔ ${r.legendaries} legendaries ${JSON.stringify(r.byMethod)} → dataset/gen3/games/emerald/legendaries.json`);
  if (r.missing.length) console.warn(`⚠ no Emerald location for: ${r.missing.join(", ")}`);
} else if (entity === "trades") {
  console.log(`▶ scraping Emerald in-game trades…`);
  const r = await scrapeTrades(refresh);
  console.log(`✔ ${r.trades} in-game trades → dataset/gen3/games/emerald/trades.json`);
  if (r.unresolved.length) console.warn(`⚠ ${r.unresolved.length} unresolved dex numbers: ${r.unresolved.join(", ")}`);
} else if (entity === "storypath") {
  console.log(`▶ enriching the critical path with HM/legendary/key-item beats…`);
  const r = deriveStoryPath();
  console.log(`✔ ${r.beats}-beat critical path ${JSON.stringify(r.byKind)} → dataset/gen3/games/emerald/story.json`);
  if (r.noLevel.length) console.warn(`⚠ ${r.noLevel.length} HM(s) at a location with no inferred level: ${r.noLevel.join(", ")}`);
} else if (entity === "natures") {
  console.log(`▶ writing the 25 Gen-3 natures reference…`);
  const r = deriveNatures();
  console.log(`✔ ${r.natures} natures (${r.neutral} neutral) → dataset/gen3/natures.json`);
} else if (entity === "obtainability") {
  console.log(`▶ deriving how each species is obtained in Emerald…`);
  const r = deriveObtainability();
  console.log(`✔ ${r.obtainable}/${r.species} obtainable in-game (${r.wildSourced} wild-sourced) → dataset/gen3/games/emerald/obtainability.json`);
} else if (entity === "evtraining") {
  console.log(`▶ deriving EV-training spots (evYield × encounters)…`);
  const r = deriveEvTraining();
  console.log(`✔ ${r.totalEntries} entries across ${r.stats} stats → dataset/gen3/games/emerald/ev-training.json`);
} else if (entity === "shiny") {
  console.log(`▶ deriving reset-able shiny targets (gifts + static legendaries)…`);
  const r = deriveShiny();
  console.log(`✔ ${r.targets} shiny targets ${JSON.stringify(r.byMethod)} → dataset/gen3/games/emerald/shiny-targets.json`);
} else if (entity === "locations") {
  console.log(`▶ building the canonical location registry from the game data…`);
  const r = deriveLocations();
  console.log(`✔ ${r.locations} locations (${r.named} named by Serebii) → dataset/gen3/games/emerald/locations.json`);
} else if (entity === "manifest") {
  console.log(`▶ scanning dataset/ generations → manifest.json…`);
  const r = deriveManifest();
  console.log(`✔ ${r.generations} generation(s), ${r.games} game(s) → dataset/manifest.json`);
} else {
  console.error(`unknown entity "${entity}" — use "pokemon", "moves", "learnedby", "machines", "typechart", "abilities", "natures", "encounters", "items", "itemdex", "itemlinks", "connectivity", "trainers", "gifts", "legendaries", "trades", "storypath", "obtainability", "evtraining", "shiny", "locations", or "manifest"`);
  process.exit(1);
}
