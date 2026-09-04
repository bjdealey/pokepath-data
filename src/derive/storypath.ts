// Enrich the story critical path with the non-battle progression beats a real
// playthrough needs: obtaining an HM, catching a story legendary, picking up a
// key item. The battle spine (gym/E4/champion + villain/rival) is built by
// `trainers`; this joins the HM table, the legendaries, and the key items onto
// it and re-orders everything by level. Idempotent — it rebuilds the non-battle
// beats from scratch each run. No network. Run after trainers + machines +
// legendaries + itemdex/itemlinks; run `locations` after it (new beat locations
// join the registry there).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import type { ItemRecord, Legendary, Machine, StoryBeat } from "../types.ts";

const G = `${DATASET}games/emerald/`;
// Legendary location prose → slug: drop a trailing "(Route 105)" qualifier first.
const locSlug = (s: string) => s.replace(/\(.*$/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const BATTLE = new Set(["gym", "elite-four", "champion", "villain", "rival"]);

export function deriveStoryPath() {
  const story = JSON.parse(readFileSync(`${G}story.json`, "utf8"));
  const level = new Map<string, number>((story.locations as Array<{ slug: string; level: number }>).map((l) => [l.slug, l.level]));
  const pokeName = new Map<string, string>(
    (JSON.parse(readFileSync(`${DATASET}pokemon/index.json`, "utf8")) as Array<{ slug: string; name: string }>).map((p) => [p.slug, p.name]),
  );

  // Keep the battle spine; regenerate every non-battle beat (idempotent).
  const battle = (story.criticalPath as StoryBeat[]).filter((b) => BATTLE.has(b.kind));
  const maxLvl = Math.max(...battle.map((b) => b.levelCap), 0);
  const beats: Array<Omit<StoryBeat, "order">> = battle.map(({ order, ...b }) => b);

  // --- HM pickups: where you obtain each field move, placed at that area's level.
  const machines = JSON.parse(readFileSync(`${DATASET}machines.json`, "utf8")) as Machine[];
  const noLevel: string[] = [];
  for (const m of machines) {
    if (m.kind !== "HM") continue;
    const at = m.emerald.locations[0];
    if (!at) continue;
    const lv = level.get(at.location);
    if (lv === undefined) {
      noLevel.push(`${m.machine}@${at.location}`);
      continue;
    }
    beats.push({ kind: "hm", location: at.location, levelCap: lv, hm: m.machine, move: m.move, name: m.move, method: at.method });
  }

  // --- Story legendaries: in-Hoenn static/roaming only (event-island ones like
  //     Mew/Deoxys aren't on the path). All marked `optional` — they're catchable
  //     extras, and Serebii gives no way to prove which are story-mandatory or to
  //     time them precisely (a location's inferred level is its wild-encounter
  //     level, which under-reads late areas like Sky Pillar). Placed by that level
  //     where known, else after the spine.
  const legendaries = JSON.parse(readFileSync(`${G}legendaries.json`, "utf8")) as Legendary[];
  for (const l of legendaries) {
    if (l.method === "event") continue;
    const location = l.method === "roaming" ? "" : locSlug(l.location); // roamers have no fixed spot
    const lv = location ? level.get(location) : undefined;
    beats.push({
      kind: "legendary",
      location,
      levelCap: lv ?? maxLvl + 1,
      pokemon: l.pokemon,
      name: pokeName.get(l.pokemon) ?? l.pokemon,
      method: l.method,
      optional: true,
    });
  }

  // --- Key items with a known find location (story-gift key items — bikes, Devon
  //     Goods — have no findable location, so they can't be placed).
  const idir = `${DATASET}items/`;
  for (const f of readdirSync(idir)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    const it = JSON.parse(readFileSync(idir + f, "utf8")) as ItemRecord;
    if (!/Key Item/i.test(it.category)) continue;
    const at = it.foundAt?.[0];
    const lv = at ? level.get(at.location) : undefined;
    if (!at || lv === undefined) continue;
    beats.push({ kind: "item", location: at.location, levelCap: lv, item: it.slug, name: it.name, method: at.method });
  }

  // Order by level; stable tiebreak keeps battles before the pickups at a shared
  // level (you fight, then grab what's around).
  const criticalPath: StoryBeat[] = beats
    .map((b, i) => ({ b, i }))
    .sort((x, y) => x.b.levelCap - y.b.levelCap || x.i - y.i)
    .map(({ b }, i) => ({ order: i + 1, ...b }));

  writeFileSync(`${G}story.json`, JSON.stringify({ ...story, criticalPath }, null, 2));

  const byKind = criticalPath.reduce<Record<string, number>>((m, b) => ((m[b.kind] = (m[b.kind] ?? 0) + 1), m), {});
  return { beats: criticalPath.length, byKind, noLevel };
}
