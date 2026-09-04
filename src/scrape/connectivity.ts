// Build the Hoenn location graph from the pokearth ORAS pages' exit links
// (the 3rd-gen pages don't carry exits, but Hoenn's map is identical across
// games). Seeds from the region index, then follows exits to reach every
// connected location. Emits dataset/games/emerald/connections.json.
import { mkdir, writeFile } from "node:fs/promises";
import { GEN_DIR as DATASET } from "../paths.ts";
import * as cheerio from "cheerio";
import { fetchCached } from "../fetch.ts";
import { parseExits } from "../parse/connectivity.ts";

const BASE = "https://www.serebii.net/pokearth/hoenn";
const orasUrl = (slug: string) => `${BASE}/${slug}.shtml`;
const MAX_PAGES = 140;

function seedSlugs($: cheerio.CheerioAPI): string[] {
  const slugs = new Set<string>();
  $("area, a").each((_i, e) => {
    const m = ($(e).attr("href") ?? "").match(/\/pokearth\/hoenn\/([a-z0-9.]+)\.shtml/i);
    if (m?.[1] && !/^index$/i.test(m[1])) slugs.add(m[1].toLowerCase());
  });
  return [...slugs];
}

interface Node {
  name: string;
  exits: Record<string, string>;
}

export async function scrapeConnectivity(refresh = false) {
  const index = cheerio.load(await fetchCached(`${BASE}/`, { refresh }));
  const queue = seedSlugs(index);
  const seen = new Set<string>();
  const graph = new Map<string, Node>();

  while (queue.length && graph.size < MAX_PAGES) {
    const slug = queue.shift()!;
    if (seen.has(slug)) continue;
    seen.add(slug);
    let html: string;
    try {
      html = await fetchCached(orasUrl(slug), { refresh });
    } catch {
      continue;
    }
    const { name, exits } = parseExits(html);
    graph.set(slug, { name, exits });
    for (const target of Object.values(exits)) if (!seen.has(target)) queue.push(target);
  }

  const routeNum = (slug: string) => slug.match(/^route(\d+)$/)?.[1]?.padStart(4, "0");
  const sorted = [...graph.entries()].sort(([a], [b]) => {
    const ra = routeNum(a);
    const rb = routeNum(b);
    return ra && rb ? ra.localeCompare(rb) : ra ? -1 : rb ? 1 : a.localeCompare(b);
  });
  const connections: Record<string, Node> = {};
  for (const [slug, node] of sorted) connections[slug] = node;

  const dir = `${DATASET}games/emerald/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}connections.json`, JSON.stringify(connections, null, 2));

  return {
    locations: graph.size,
    edges: [...graph.values()].reduce((n, node) => n + Object.keys(node.exits).length, 0),
    dangling: [...new Set([...graph.values()].flatMap((n) => Object.values(n.exits)))].filter((t) => !graph.has(t)),
  };
}
