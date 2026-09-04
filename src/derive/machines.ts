// Derive the canonical Gen-3 TM/HM → move table by inverting the Pokémon
// machine learnsets (every mon that learns via TM06 learns Toxic). No network.
// Enriches each with the move's type/category (from moves/) and where it's
// obtained in Emerald (gym badge from story milestones, on-ground finds from
// the location items). Emits dataset/machines.json.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import type { Machine, MoveRecord, PokemonRecord } from "../types.ts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Normalize a machine code so TM06 (learnset), tm6, and tm06 (item slug) join. */
export const codeKey = (code: string) => code.toUpperCase().replace(/^([TH]M)0*(\d+)$/i, "$1$2"); // TM06 / tm6 → TM6

// HMs handed over by an NPC that the pokearth item tables don't list as finds.
// Emerald obtain location per Serebii's ItemDex "Locations" table; slugs match
// the encounters/location files. (The other 6 HMs come from the item finds.)
const HM_LOCATION: Record<string, Array<{ location: string; method: string }>> = {
  HM5: [{ location: "granitecave", method: "Gift (Hiker)" }], // Flash
  HM7: [{ location: "caveoforigin", method: "Gift" }], // Waterfall
};

export function deriveMachines() {
  // machine code → move name, from the Pokémon learnsets.
  const machineMove = new Map<string, string>();
  const pdir = `${DATASET}pokemon/`;
  for (const f of readdirSync(pdir).filter((f) => f.endsWith(".json") && f !== "index.json")) {
    const p = JSON.parse(readFileSync(pdir + f, "utf8")) as PokemonRecord;
    for (const m of p.learnset.machine) if (!machineMove.has(m.machine)) machineMove.set(m.machine, m.move);
  }

  // move name → details.
  const moveInfo = new Map<string, { slug: string; type: string; category: string }>();
  const mdir = `${DATASET}moves/`;
  if (existsSync(mdir)) {
    for (const f of readdirSync(mdir).filter((f) => f.endsWith(".json") && f !== "index.json")) {
      const mv = JSON.parse(readFileSync(mdir + f, "utf8")) as MoveRecord;
      moveInfo.set(norm(mv.name), { slug: mv.slug, type: mv.type, category: mv.category });
    }
  }

  // Emerald sources: gym-badge rewards (story) + on-ground finds (location items).
  const badgeOf = new Map<string, string>();
  const storyPath = `${DATASET}games/emerald/story.json`;
  if (existsSync(storyPath)) {
    const story = JSON.parse(readFileSync(storyPath, "utf8")) as { milestones: Array<{ tmReward?: string; badge?: string }> };
    for (const m of story.milestones) if (m.tmReward && m.badge) badgeOf.set(codeKey(m.tmReward), m.badge);
  }
  const findsOf = new Map<string, Array<{ location: string; method: string }>>();
  const itemsPath = `${DATASET}games/emerald/items.json`;
  if (existsSync(itemsPath)) {
    const items = JSON.parse(readFileSync(itemsPath, "utf8")) as Record<string, { location: string; items: Array<{ slug: string; method: string }> }>;
    for (const [locSlug, loc] of Object.entries(items)) {
      for (const it of loc.items) {
        if (!/^(tm|hm)\d+$/i.test(it.slug)) continue;
        const key = codeKey(it.slug);
        const list = findsOf.get(key) ?? [];
        if (!findsOf.has(key)) findsOf.set(key, list);
        list.push({ location: locSlug, method: it.method }); // slug key, not the display-name field — joins the other location files
      }
    }
  }

  const machines: Machine[] = [...machineMove.entries()].map(([machine, move]) => {
    const info = moveInfo.get(norm(move));
    const key = codeKey(machine);
    const locations = findsOf.get(key) ?? HM_LOCATION[key] ?? [];
    return {
      machine,
      kind: machine.toUpperCase().startsWith("HM") ? "HM" : "TM",
      number: Number(machine.match(/\d+/)?.[0] ?? 0),
      move,
      moveSlug: info?.slug ?? null,
      type: info?.type ?? null,
      category: info?.category ?? null,
      emerald: { badge: badgeOf.get(key), locations },
    };
  });
  machines.sort((a, b) => a.kind.localeCompare(b.kind) || a.number - b.number);

  writeFileSync(`${DATASET}machines.json`, JSON.stringify(machines, null, 2));
  return {
    machines: machines.length,
    tms: machines.filter((m) => m.kind === "TM").length,
    hms: machines.filter((m) => m.kind === "HM").length,
    unresolved: machines.filter((m) => !m.moveSlug).map((m) => m.machine),
  };
}
