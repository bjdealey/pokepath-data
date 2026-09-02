// All Emerald route trainers, parsed from the Hoenn pokearth "3rd" pages'
// Emerald `trainers-em` sections. Each trainer is tagged kind = rival /
// villain / trainer. Exact-duplicate tables are de-duped; rematches (same
// trainer, higher levels) and rival starter-variants are kept as distinct.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { crawlHoenn3rd } from "./hoenn-crawl.ts";
import { parseRouteTrainers } from "../parse/pokearth-trainers.ts";
import type { RouteTrainer } from "../types.ts";

const DATASET = fileURLToPath(new URL("../../dataset/", import.meta.url));
const KIND_RANK: Record<RouteTrainer["kind"], number> = { rival: 0, villain: 1, trainer: 2 };

const signature = (t: RouteTrainer) =>
  `${t.location}|${t.label}|${t.variant ?? ""}|${t.team.map((p) => `${p.pokemon}:${p.level}`).join(",")}`;

export async function scrapeRouteTrainers(refresh = false) {
  const pages = await crawlHoenn3rd(refresh);
  const all: RouteTrainer[] = [];
  const seen = new Set<string>();

  for (const { slug, html } of pages) {
    for (const t of parseRouteTrainers(html, slug)) {
      const sig = signature(t);
      if (seen.has(sig)) continue;
      seen.add(sig);
      all.push(t);
    }
  }

  all.sort(
    (a, b) =>
      a.location.localeCompare(b.location) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.label.localeCompare(b.label),
  );

  const dir = `${DATASET}games/emerald/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}route-trainers.json`, JSON.stringify(all, null, 2));

  return {
    pages: pages.length,
    total: all.length,
    rival: all.filter((t) => t.kind === "rival").length,
    villain: all.filter((t) => t.kind === "villain").length,
    trainer: all.filter((t) => t.kind === "trainer").length,
  };
}
