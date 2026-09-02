// Crawl every Hoenn "3rd"-gen pokearth page: region-map seeds + one level
// deeper (relative links) to reach indoor pages (caves, hideouts, Space
// Center…). Returns the fetched pages; parsing is left to callers. All fetches
// are cache-first, so repeat crawls are offline and instant.
import * as cheerio from "cheerio";
import { fetchCached } from "../fetch.ts";

const BASE = "https://www.serebii.net/pokearth/hoenn";
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

export async function crawlHoenn3rd(refresh = false): Promise<Array<{ slug: string; html: string }>> {
  const index = cheerio.load(await fetchCached(`${BASE}/`, { refresh }));
  const queue = seedSlugs(index);
  const seen = new Set<string>();
  const pages: Array<{ slug: string; html: string }> = [];

  while (queue.length && pages.length < MAX_PAGES) {
    const slug = queue.shift()!;
    if (seen.has(slug)) continue;
    seen.add(slug);
    let html: string;
    try {
      html = await fetchCached(`${BASE}/3rd/${slug}.shtml`, { refresh });
    } catch {
      continue; // 404 / no 3rd page (negative-cached)
    }
    for (const s of subSlugs(cheerio.load(html))) if (!seen.has(s)) queue.push(s);
    pages.push({ slug, html });
  }
  return pages;
}
