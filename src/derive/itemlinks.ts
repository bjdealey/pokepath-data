// Derive item reverse-indexes and bake them onto each item record: `heldBy`
// (wild Pokémon that carry the item) by inverting pokemon.wildItems, and
// `foundAt` (Emerald locations it's found at) by inverting games/emerald/
// items.json. No network. Run after `pokemon`, `items`, and `itemdex`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import type { ItemRecord, LocationItem, PokemonRecord } from "../types.ts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function deriveItemLinks() {
  const idir = `${DATASET}items/`;
  const items = readdirSync(idir)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => JSON.parse(readFileSync(idir + f, "utf8")) as ItemRecord);
  const nameToSlug = new Map<string, string>();
  for (const it of items) nameToSlug.set(norm(it.name), it.slug);

  // heldBy — invert every Pokémon's wildItems (match by item name → slug).
  const heldBy = new Map<string, NonNullable<ItemRecord["heldBy"]>>();
  const unmatchedHeld = new Set<string>();
  const pdir = `${DATASET}pokemon/`;
  for (const f of readdirSync(pdir)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    const p = JSON.parse(readFileSync(pdir + f, "utf8")) as PokemonRecord;
    for (const w of p.wildItems ?? []) {
      const slug = nameToSlug.get(norm(w.item));
      if (!slug) {
        unmatchedHeld.add(w.item);
        continue;
      }
      const list = heldBy.get(slug) ?? [];
      if (!heldBy.has(slug)) heldBy.set(slug, list);
      list.push({ pokemon: p.slug, natdex: p.natdex, rate: w.rate });
    }
  }
  for (const l of heldBy.values()) l.sort((a, b) => a.natdex - b.natdex);

  // foundAt — invert the per-location findable items (keyed by location slug).
  const foundAt = new Map<string, NonNullable<ItemRecord["foundAt"]>>();
  const loc = JSON.parse(readFileSync(`${DATASET}games/emerald/items.json`, "utf8")) as Record<
    string,
    { items: LocationItem[] }
  >;
  for (const [location, l] of Object.entries(loc)) {
    for (const it of l.items) {
      const list = foundAt.get(it.slug) ?? [];
      if (!foundAt.has(it.slug)) foundAt.set(it.slug, list);
      list.push({ location, method: it.method });
    }
  }

  for (const it of items) {
    const held = heldBy.get(it.slug) ?? [];
    const found = foundAt.get(it.slug) ?? [];
    if (held.length) it.heldBy = held;
    else delete it.heldBy;
    if (found.length) it.foundAt = found;
    else delete it.foundAt;
    writeFileSync(`${idir}${it.slug}.json`, JSON.stringify(it, null, 2));
  }

  return {
    items: items.length,
    withHeldBy: [...heldBy.values()].filter((l) => l.length).length,
    withFoundAt: [...foundAt.values()].filter((l) => l.length).length,
    unmatchedHeld: [...unmatchedHeld].sort(),
  };
}
