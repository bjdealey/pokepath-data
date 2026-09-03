// All Emerald trainers in one dataset + the story/progression spine.
//   - Gym leaders / Elite Four / Champion from /emerald/gym.shtml + elite.shtml
//     (marquee battles WITH movesets + badge/field-move progression metadata).
//   - Every route trainer from the pokearth `trainers-em` sections (team + level).
// story.json = the fixed gym→E4→Champion milestones PLUS an inferred location
// order: each location's median trainer level (or encounter level) sorted and
// pegged to the gym level-cap bands. Heuristic order, not canonical.
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchCached } from "../fetch.ts";
import { crawlHoenn3rd } from "./hoenn-crawl.ts";
import { parseTrainerRosters, parseGymProgression, parseEliteProgression, trainerSlug } from "../parse/trainers.ts";
import { parseRouteTrainers } from "../parse/pokearth-trainers.ts";
import type { StoryLocation, StoryMilestone, Trainer } from "../types.ts";

const DATASET = fileURLToPath(new URL("../../dataset/", import.meta.url));
const GYM_URL = "https://www.serebii.net/emerald/gym.shtml";
const ELITE_URL = "https://www.serebii.net/emerald/elite.shtml";

const levelCap = (team: { level: number }[]) => team.reduce((mx, p) => Math.max(mx, p.level), 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

export async function scrapeTrainers(refresh = false) {
  const trainers: Trainer[] = [];
  const milestones: StoryMilestone[] = [];

  // --- Gym leaders + Elite Four + Champion (with movesets) ---
  const gymHtml = await fetchCached(GYM_URL, { refresh });
  const eliteHtml = await fetchCached(ELITE_URL, { refresh });
  const gymRosters = parseTrainerRosters(gymHtml);
  const eliteRosters = parseTrainerRosters(eliteHtml);
  const gymMeta = parseGymProgression(gymHtml);
  const eliteMeta = parseEliteProgression(eliteHtml);

  gymRosters.forEach((r, i) => {
    const meta = gymMeta[i];
    const slug = trainerSlug(r.name);
    trainers.push({
      slug, trainer: slug, label: r.name, kind: "gym-leader",
      location: meta?.location ?? "", locationName: meta?.city ?? meta?.location ?? "",
      order: i + 1, specialty: meta?.specialty, badge: meta?.badge, tmReward: meta?.tmReward, fieldMove: meta?.fieldMove,
      team: r.team,
    });
    milestones.push({
      order: i + 1, kind: "gym", name: r.name, slug, location: meta?.city,
      specialty: meta?.specialty, badge: meta?.badge, tmReward: meta?.tmReward, fieldMove: meta?.fieldMove,
      levelCap: levelCap(r.team),
    });
  });

  const champ = eliteRosters.length > eliteMeta.length ? eliteRosters.at(-1) : undefined;
  eliteRosters.forEach((r, i) => {
    const isChamp = r === champ;
    const meta = isChamp ? undefined : eliteMeta[i];
    const slug = trainerSlug(r.name);
    trainers.push({
      slug, trainer: slug, label: r.name, kind: isChamp ? "champion" : "elite-four",
      location: "", locationName: "", order: gymRosters.length + i + 1, specialty: meta?.specialty, team: r.team,
    });
    milestones.push({
      order: gymRosters.length + i + 1, kind: isChamp ? "champion" : "elite-four",
      name: r.name, slug, specialty: meta?.specialty, levelCap: levelCap(r.team),
    });
  });

  // --- Route trainers (pokearth crawl) ---
  const pages = await crawlHoenn3rd(refresh);
  const seen = new Set<string>();
  for (const { slug, html } of pages) {
    for (const t of parseRouteTrainers(html, slug)) {
      const sig = `${t.location}|${t.label}|${t.variant ?? ""}|${t.team.map((p) => `${p.pokemon}:${p.level}`).join(",")}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      trainers.push(t);
    }
  }

  // --- Unique slug per battle (a trainer's rematch tiers / story battles share
  //     `trainer` identity but need distinct `slug`s so none get shadowed by the
  //     API's by-slug lookup). Gym/elite rows come first, so the marquee battle
  //     keeps the bare slug and rematches get -2, -3, …
  // ponytail: suffix order follows scrape order (stable across runs); good enough. ---
  const slugCount = new Map<string, number>();
  for (const t of trainers) {
    const n = (slugCount.get(t.trainer) ?? 0) + 1;
    slugCount.set(t.trainer, n);
    t.slug = n > 1 ? `${t.trainer}-${n}` : t.trainer;
  }

  // --- Validate gym/elite movesets join the move records (like learnsets do,
  //     via normalization). Warn on any that don't, post-alias. ---
  const moveNorm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const knownMoves = new Set<string>();
  const movesIndex = `${DATASET}moves/index.json`;
  if (existsSync(movesIndex))
    for (const m of JSON.parse(readFileSync(movesIndex, "utf8")) as Array<{ name: string }>) knownMoves.add(moveNorm(m.name));
  const unresolvedMoves = new Set<string>();
  if (knownMoves.size)
    for (const t of trainers) for (const p of t.team) for (const mv of p.moves ?? []) if (!knownMoves.has(moveNorm(mv))) unresolvedMoves.add(mv);

  // --- Story: infer a location order from levels ---
  const gymCaps = milestones.filter((m) => m.kind === "gym").map((m) => m.levelCap).sort((a, b) => a - b);
  const locLevels = new Map<string, { name: string; levels: number[]; via: "trainers" | "encounters" }>();
  for (const t of trainers) {
    if (t.kind === "gym-leader" || t.kind === "elite-four" || t.kind === "champion" || !t.location) continue;
    const e = locLevels.get(t.location) ?? { name: t.locationName, levels: [], via: "trainers" as const };
    for (const p of t.team) e.levels.push(p.level);
    locLevels.set(t.location, e);
  }
  // Fallback: wild-encounter levels for locations with no trainers (caves, etc.).
  const encPath = `${DATASET}games/emerald/encounters.json`;
  if (existsSync(encPath)) {
    const enc = JSON.parse(readFileSync(encPath, "utf8")) as Record<string, { location: string; encounters: Array<{ levelMax: number | null }> }>;
    for (const [slug, loc] of Object.entries(enc)) {
      if (locLevels.has(slug)) continue;
      const levels = loc.encounters.map((e) => e.levelMax ?? 0).filter((n) => n > 0);
      if (levels.length) locLevels.set(slug, { name: loc.location, levels, via: "encounters" });
    }
  }
  const locations: StoryLocation[] = [...locLevels.entries()]
    .map(([slug, e]) => {
      const level = median(e.levels);
      return { slug, name: e.name, level, phase: gymCaps.filter((c) => c < level).length, via: e.via };
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  const dir = `${DATASET}games/emerald/`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}trainers.json`, JSON.stringify(trainers, null, 2));
  await writeFile(`${dir}story.json`, JSON.stringify({ milestones, locations }, null, 2));

  const byKind = trainers.reduce<Record<string, number>>((m, t) => ((m[t.kind] = (m[t.kind] ?? 0) + 1), m), {});
  return { pages: pages.length, trainers: trainers.length, byKind, milestones: milestones.length, locations: locations.length, unresolvedMoves: [...unresolvedMoves] };
}
