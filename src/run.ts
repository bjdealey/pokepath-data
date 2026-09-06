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
import { scrapeNatures } from "./scrape/natures.ts";
import { deriveObtainability } from "./derive/obtainability.ts";
import { deriveEvTraining } from "./derive/evtraining.ts";
import { deriveShiny } from "./derive/shiny.ts";
import { deriveSprites } from "./derive/sprites.ts";
import { deriveManifest } from "./derive/manifest.ts";
import { scrapeTrainers } from "./scrape/trainers.ts";
import { scrapeTrades } from "./scrape/trades.ts";
import { ALL_GAMES } from "./games.ts";
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
  for (const game of ALL_GAMES) {
    const r = await scrapeEncounters(game, refresh);
    console.log(`✔ ${game}: ${r.locations} locations, ${r.encounters} encounters → games/${game}/`);
  }
} else if (entity === "items") {
  for (const game of ALL_GAMES) {
    const r = await scrapeItems(game, refresh);
    console.log(`✔ ${game}: ${r.locations} locations, ${r.items} items → games/${game}/`);
  }
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
  for (const game of ALL_GAMES) {
    const r = await scrapeConnectivity(game, refresh);
    console.log(`✔ ${game}: ${r.locations} locations, ${r.edges} exit edges → games/${game}/connections.json`);
    if (r.dangling.length) console.warn(`  ⚠ ${r.dangling.length} exits to un-crawled locations`);
  }
} else if (entity === "trainers") {
  for (const game of ALL_GAMES) {
    const r = await scrapeTrainers(game, refresh);
    console.log(`✔ ${game}: ${r.trainers} trainers ${JSON.stringify(r.byKind)}, ${r.criticalPath}-beat path → games/${game}/`);
    if (r.unresolvedMoves.length) console.warn(`  ⚠ ${r.unresolvedMoves.length} trainer move(s) unmatched: ${r.unresolvedMoves.slice(0, 8).join(", ")}`);
  }
} else if (entity === "gifts") {
  for (const game of ALL_GAMES) {
    const r = await scrapeGifts(game, refresh);
    console.log(`✔ ${game}: ${r.gifts} gift/starter ${JSON.stringify(r.byMethod)} → games/${game}/gifts.json`);
  }
} else if (entity === "abilities") {
  console.log(`▶ deriving the Gen-3 abilities collection from Pokémon ability text…`);
  const r = deriveAbilities();
  console.log(`✔ ${r.abilities} abilities (${r.withEffect} with effect) → dataset/gen3/abilities/  (normalized ${r.renamed} pokemon ability names)`);
} else if (entity === "legendaries") {
  for (const game of ALL_GAMES) {
    const r = deriveLegendaries(game);
    console.log(`✔ ${game}: ${r.legendaries} legendaries ${JSON.stringify(r.byMethod)} → games/${game}/legendaries.json`);
  }
} else if (entity === "trades") {
  for (const game of ALL_GAMES) {
    const r = await scrapeTrades(game, refresh);
    console.log(`✔ ${game}: ${r.trades} in-game trades → games/${game}/trades.json`);
    if (r.unresolved.length) console.warn(`  ⚠ ${r.unresolved.length} unresolved dex numbers`);
  }
} else if (entity === "storypath") {
  for (const game of ALL_GAMES) {
    const r = deriveStoryPath(game);
    console.log(`✔ ${game}: ${r.beats}-beat critical path ${JSON.stringify(r.byKind)} → games/${game}/story.json`);
  }
} else if (entity === "natures") {
  console.log(`▶ scraping the 25 natures from Serebii…`);
  const r = await scrapeNatures(refresh);
  console.log(`✔ ${r.natures} natures (${r.neutral} neutral) → dataset/gen3/natures.json`);
  if (r.missing.length) console.warn(`⚠ missing natures: ${r.missing.join(", ")}`);
} else if (entity === "obtainability") {
  for (const game of ALL_GAMES) {
    const r = deriveObtainability(game);
    console.log(`✔ ${game}: ${r.obtainable}/${r.species} obtainable (${r.wildSourced} wild-sourced) → games/${game}/obtainability.json`);
  }
} else if (entity === "evtraining") {
  for (const game of ALL_GAMES) {
    const r = deriveEvTraining(game);
    console.log(`✔ ${game}: ${r.totalEntries} EV-training entries → games/${game}/ev-training.json`);
  }
} else if (entity === "shiny") {
  for (const game of ALL_GAMES) {
    const r = deriveShiny(game);
    console.log(`✔ ${game}: ${r.targets} shiny targets ${JSON.stringify(r.byMethod)} → games/${game}/shiny-targets.json`);
  }
} else if (entity === "sprites") {
  console.log(`▶ baking Serebii sprite URLs into Pokémon records…`);
  const r = deriveSprites();
  console.log(`✔ ${r.pokemon} pokemon enriched with sprites (normal+shiny per game + artwork) → dataset/${GEN}/pokemon/`);
} else if (entity === "locations") {
  for (const game of ALL_GAMES) {
    const r = deriveLocations(game);
    console.log(`✔ ${game}: ${r.locations} locations (${r.named} named) → games/${game}/locations.json`);
  }
} else if (entity === "manifest") {
  console.log(`▶ scanning dataset/ generations → manifest.json…`);
  const r = deriveManifest();
  console.log(`✔ ${r.generations} generation(s), ${r.games} game(s) → dataset/manifest.json`);
} else {
  console.error(`unknown entity "${entity}" — use "pokemon", "moves", "learnedby", "machines", "typechart", "abilities", "natures", "encounters", "items", "itemdex", "itemlinks", "connectivity", "trainers", "gifts", "legendaries", "trades", "storypath", "obtainability", "evtraining", "shiny", "sprites", "locations", or "manifest"`);
  process.exit(1);
}
