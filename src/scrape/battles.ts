// Scrape Emerald rival + villain (Team Magma/Aqua) battles from the Hoenn
// pokearth "3rd" pages. Seeds = the region map's locations; then crawl one
// level deeper to reach indoor pages (hideouts, Mt. Chimney, Space Center…)
// where villain fights happen. Only Emerald (`trainers-em`) rosters are kept.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { fetchCached } from "../fetch.ts";
import { parseEmeraldBattles } from "../parse/pokearth-trainers.ts";
import type { Battle } from "../types.ts";

const DATASET = fileURLToPath(new URL("../../dataset/", import.meta.url));
const BASE = "https://www.serebii.net/pokearth/hoenn";
const url3rd = (slug: string) => `${BASE}/3rd/${slug}.shtml`;
const MAX_PAGES = 130;

// Region-index seeds: absolute links to Hoenn locations.
function seedSlugs($: cheerio.CheerioAPI): string[] {
  const slugs = new Set<string>();
  $("area, a").each((_i, e) => {
    const m = ($(e).attr("href") ?? "").match(/\/pokearth\/hoenn\/(?:3rd\/)?([a-z0-9]+)\.shtml/i);
    if (m?.[1] && !/^index$/i.test(m[1])) slugs.add(m[1]);
  });
  return [...slugs];
}

// Same-directory (relative) links on a 3rd page → indoor sub-pages, no nav junk.
function subSlugs($: cheerio.CheerioAPI): string[] {
  const slugs = new Set<string>();
  $("a").each((_i, a) => {
    const m = ($(a).attr("href") ?? "").match(/^([a-z0-9]+)\.shtml$/i);
    if (m?.[1] && !/^index$/i.test(m[1])) slugs.add(m[1]);
  });
  return [...slugs];
}

export async function scrapeBattles(refresh = false) {
  const index = cheerio.load(await fetchCached(`${BASE}/`, { refresh }));
  const queue = seedSlugs(index);
  const seen = new Set<string>();
  const battles: Battle[] = [];
  let pages = 0;

  while (queue.length && pages < MAX_PAGES) {
    const slug = queue.shift()!;
    if (seen.has(slug)) continue;
    seen.add(slug);
    let html: string;
    try {
      html = await fetchCached(url3rd(slug), { refresh });
    } catch {
      continue; // 404 / no 3rd page for this slug
    }
    pages++;
    // Discover indoor sub-pages linked from this one (one level deeper).
    for (const s of subSlugs(cheerio.load(html))) if (!seen.has(s)) queue.push(s);
    battles.push(...parseEmeraldBattles(html, slug));
  }

  battles.sort((a, b) =>
    a.kind === b.kind ? a.location.localeCompare(b.location) || a.label.localeCompare(b.label) : a.kind === "rival" ? -1 : 1,
  );

  const dir = `${DATASET}games/emerald/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}battles.json`, JSON.stringify(battles, null, 2));

  return {
    pages,
    battles: battles.length,
    rival: battles.filter((b) => b.kind === "rival").length,
    villain: battles.filter((b) => b.kind === "villain").length,
    villainLabels: [...new Set(battles.filter((b) => b.kind === "villain").map((b) => b.label))],
  };
}
