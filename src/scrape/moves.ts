// Scrape the Gen-III AttackDex: read the index's move list, fetch each move
// page, emit dataset/moves/<slug>.json + index.json. Moves are canonical
// (game-agnostic within Gen 3), so they live at the dataset root like pokemon.
import { mkdir, writeFile } from "node:fs/promises";
import { GEN_DIR as DATASET } from "../paths.ts";
import * as cheerio from "cheerio";
import { fetchCached } from "../fetch.ts";
import { parseMove } from "../parse/move.ts";
import type { MoveRecord } from "../types.ts";

const INDEX = "https://www.serebii.net/attackdex/index.shtml";
const moveUrl = (slug: string) => `https://www.serebii.net/attackdex/${slug}.shtml`;

function moveSlugs(html: string): string[] {
  const $ = cheerio.load(html);
  const slugs = new Set<string>();
  $("option[value*='/attackdex/'], a[href*='/attackdex/']").each((_i, el) => {
    const ref = $(el).attr("value") ?? $(el).attr("href") ?? "";
    const m = ref.match(/\/attackdex\/([a-z0-9-]+)\.shtml/i);
    if (m?.[1] && !/^index$/i.test(m[1])) slugs.add(m[1].toLowerCase());
  });
  return [...slugs].sort();
}

export async function scrapeMoves(refresh = false, limit = 0) {
  const slugs = moveSlugs(await fetchCached(INDEX, { refresh }));
  const list = limit > 0 ? slugs.slice(0, limit) : slugs;

  const moves: MoveRecord[] = [];
  for (const slug of list) {
    try {
      const move = parseMove(await fetchCached(moveUrl(slug), { refresh }), moveUrl(slug));
      if (!move.name) continue;
      // The Gen-III AttackDex index lists a few later-gen moves whose Gen-3 page
      // is empty (0 PP, no data) — e.g. Heart Swap. Real Gen-3 moves always have
      // PP; Shadow moves (Colosseum/XD) legitimately have none, so keep those.
      if (!move.pp && move.type !== "shadow") continue;
      moves.push(move);
    } catch (err) {
      console.warn(`  ${slug}: ${(err as Error).message}`);
    }
  }

  const dir = `${DATASET}moves/`;
  await mkdir(dir, { recursive: true });
  for (const m of moves) await writeFile(`${dir}${m.slug}.json`, JSON.stringify(m, null, 2));
  moves.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(
    `${dir}index.json`,
    JSON.stringify(moves.map((m) => ({ slug: m.slug, name: m.name, type: m.type, category: m.category, power: m.power })), null, 2),
  );

  return { moves: moves.length, discovered: slugs.length };
}
