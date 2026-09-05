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
import type { Game } from "../games.ts";
import type { ItemRecord, Legendary, Machine, StoryBeat } from "../types.ts";

// Legendary location prose → slug: drop a trailing "(Route 105)" qualifier first.
const locSlug = (s: string) => s.replace(/\(.*$/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const BATTLE = new Set(["gym", "elite-four", "champion", "villain", "rival"]);

export function deriveStoryPath(game: Game = "emerald") {
  const G = `${DATASET}games/${game}/`;
  const story = JSON.parse(readFileSync(`${G}story.json`, "utf8"));
  const level = new Map<string, number>((story.locations as Array<{ slug: string; level: number }>).map((l) => [l.slug, l.level]));
  const pokeName = new Map<string, string>(
    (JSON.parse(readFileSync(`${DATASET}pokemon/index.json`, "utf8")) as Array<{ slug: string; name: string }>).map((p) => [p.slug, p.name]),
  );

  // Keep the battle spine; regenerate every non-battle beat (idempotent). Every
  // beat carries a `necessity`: the definitional mandatory spine (badges + League)
  // is `required` (for speedrun / minimum-route planning); everything else on the
  // path is `supporting` — finer forced-battle data isn't in Serebii, so villain/
  // rival battles aren't promoted to `required`. Legendaries are `optional`.
  const MILESTONE = new Set(["gym", "elite-four", "champion"]);
  const battle = (story.criticalPath as StoryBeat[]).filter((b) => BATTLE.has(b.kind));
  const maxLvl = Math.max(...battle.map((b) => b.levelCap), 0);
  const beats: Array<Omit<StoryBeat, "order">> = battle.map((raw) => {
    // Strip order + any prior necessity/flags (storypath reads its own output).
    const { order, required, optional, necessity, ...b } = raw as Record<string, unknown>;
    return { ...(b as Omit<StoryBeat, "order" | "necessity">), necessity: MILESTONE.has(b.kind as string) ? "required" : "supporting" };
  });

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
    beats.push({ kind: "hm", location: at.location, levelCap: lv, hm: m.machine, move: m.move, method: at.method, necessity: "supporting" });
  }

  // --- Story legendaries: in-Hoenn static/roaming only (event-island ones like
  //     Mew/Deoxys aren't on the path). Grouped as an optional cluster AFTER the
  //     battle spine — NOT by their area's inferred level. That level is the
  //     location's wild-grass encounter level, which is the wrong signal for a
  //     static legendary (it isn't a grass encounter) and under-reads their late/
  //     post-game areas (Sky Pillar, Marine/Terra Cave, the Regi chambers). Serebii
  //     exposes no static-encounter level to time them precisely, so a post-champion
  //     cluster (natdex order among themselves) is the honest placement — no beat
  //     claims a false early slot.
  //     `necessity: "optional"` is correct for EVERY one, not a limitation: these beats
  //     are catches, and no legendary catch is mandatory in Emerald. Even Rayquaza — its
  //     required story role is the Sky Pillar cutscene (it flies off to Sootopolis),
  //     not catching it, which happens later and is optional. Splitting "story-
  //     required" from "post-game" would need walkthrough curation Serebii lacks; the
  //     one timing Serebii does give (Latias/Latios "after beating Elite Four") is
  //     already carried by method:"roaming".
  const legendaries = JSON.parse(readFileSync(`${G}legendaries.json`, "utf8")) as Legendary[];
  for (const l of legendaries) {
    if (l.method === "event") continue;
    beats.push({
      kind: "legendary",
      location: l.method === "roaming" ? "" : locSlug(l.location), // roamers have no fixed spot
      levelCap: maxLvl + 1,
      pokemon: l.pokemon,
      name: pokeName.get(l.pokemon) ?? l.pokemon,
      method: l.method,
      necessity: "optional",
    });
  }

  // --- Key items, placed at their find location's inferred level. `category` is
  //     current-gen (the ItemDex isn't gen-scoped), so this is a proxy: it can
  //     tag a Gen-3 consumable (Escape Rope) as a Key Item — kept anyway, since
  //     those are still real route pickups. A key item is skipped only when its
  //     find location has no inferred level (Contest Pass at Verdanturf Town,
  //     which has no trainers/encounters to level it), not for lack of a location.
  const idir = `${DATASET}items/`;
  for (const f of readdirSync(idir)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    const it = JSON.parse(readFileSync(idir + f, "utf8")) as ItemRecord;
    if (!/Key Item/i.test(it.category)) continue;
    const at = it.foundAt?.[0];
    const lv = at ? level.get(at.location) : undefined;
    if (!at || lv === undefined) continue;
    beats.push({ kind: "item", location: at.location, levelCap: lv, item: it.slug, name: it.name, method: at.method, necessity: "supporting" });
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
