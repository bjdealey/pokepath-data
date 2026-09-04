// Build the canonical location registry (games/<game>/locations.json): slug →
// display name, for EVERY location the game data references — encounters, the
// map graph, trainers, gifts, items, and story. Trainers/gifts/story cite a slug;
// the name lives here once. No network. Run after the game data is built.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import { locationName } from "../parse/pokearth-trainers.ts";
import type { LocationRecord } from "../types.ts";

const G = `${DATASET}games/emerald/`;
const rd = (f: string): any => (existsSync(G + f) ? JSON.parse(readFileSync(G + f, "utf8")) : null);

export function deriveLocations() {
  const enc = rd("encounters.json") ?? {};
  const conn = rd("connections.json") ?? {};
  const gitems = rd("items.json") ?? {};
  const trainers = rd("trainers.json") ?? [];
  const gifts = rd("gifts.json") ?? [];
  const story = rd("story.json") ?? { locations: [], criticalPath: [], milestones: [] };

  // Serebii's own display names, from the two files keyed by location.
  const nameOf = new Map<string, string>();
  for (const [slug, node] of Object.entries<any>(conn)) if (node?.name) nameOf.set(slug, node.name);
  for (const [slug, v] of Object.entries<any>(enc)) if (v?.location && !nameOf.has(slug)) nameOf.set(slug, v.location);

  const slugs = new Set<string>();
  Object.keys(enc).forEach((s) => slugs.add(s));
  Object.keys(conn).forEach((s) => slugs.add(s));
  Object.keys(gitems).forEach((s) => slugs.add(s));
  for (const t of trainers) if (t.location) slugs.add(t.location);
  for (const g of gifts) if (g.location) slugs.add(g.location);
  for (const l of story.locations ?? []) slugs.add(l.slug);
  for (const b of story.criticalPath ?? []) if (b.location) slugs.add(b.location);
  for (const m of story.milestones ?? []) if (m.location) slugs.add(m.location);
  for (const node of Object.values<any>(conn)) for (const target of Object.values<string>(node?.exits ?? {})) slugs.add(target);

  const records: LocationRecord[] = [...slugs]
    .filter(Boolean)
    .sort()
    .map((slug) => ({ slug, name: nameOf.get(slug) ?? locationName(slug) }));

  writeFileSync(`${G}locations.json`, JSON.stringify(records, null, 2));
  return { locations: records.length, named: records.filter((r) => nameOf.has(r.slug)).length };
}
