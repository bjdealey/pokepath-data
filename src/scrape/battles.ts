// Emerald rival + villain (Team Magma/Aqua) battles, parsed from the Hoenn
// pokearth "3rd" pages (Emerald `trainers-em` sections only).
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { crawlHoenn3rd } from "./hoenn-crawl.ts";
import { parseEmeraldBattles } from "../parse/pokearth-trainers.ts";
import type { Battle } from "../types.ts";

const DATASET = fileURLToPath(new URL("../../dataset/", import.meta.url));

export async function scrapeBattles(refresh = false) {
  const pages = await crawlHoenn3rd(refresh);
  const battles: Battle[] = [];
  for (const { slug, html } of pages) battles.push(...parseEmeraldBattles(html, slug));

  battles.sort((a, b) =>
    a.kind === b.kind ? a.location.localeCompare(b.location) || a.label.localeCompare(b.label) : a.kind === "rival" ? -1 : 1,
  );

  const dir = `${DATASET}games/emerald/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}battles.json`, JSON.stringify(battles, null, 2));

  return {
    pages: pages.length,
    battles: battles.length,
    rival: battles.filter((b) => b.kind === "rival").length,
    villain: battles.filter((b) => b.kind === "villain").length,
    villainLabels: [...new Set(battles.filter((b) => b.kind === "villain").map((b) => b.label))],
  };
}
