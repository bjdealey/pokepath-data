// Bake Serebii sprite/icon URLs into the dataset (no network). Every image URL
// is a pure function of data a record already holds (src/sprites.ts):
//   pokemon  → `sprites`  (normal + shiny battle sprites per game + artwork)
//   items    → `sprite`   (ItemDex icon, from the item slug)
//   moves    → `typeIcon` (type badge, from the move's type)
//   machines → `typeIcon` (type badge, from the machine's move type)
//   types    → dataset/gen3/type-icons.json (type → badge, mirroring the type chart)
// Run after the collections it enriches exist (pokemon/items/moves + machines +
// typechart). Each added key is rebuilt in place, so re-running is idempotent.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { GEN_DIR } from "../paths.ts";
import { itemSprite, spritesForDex, typeIcon } from "../sprites.ts";
import type { ItemRecord, Machine, MoveRecord, PokemonRecord } from "../types.ts";

const write = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2));

/** Rewrite every per-entity record in dataset/gen3/<name>/ through `enrich`
 * (which returns the record with its image key inserted). Skips index.json. */
function enrichCollection<T>(name: string, enrich: (rec: T) => T): number {
  const dir = `${GEN_DIR}${name}/`;
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "index.json") continue;
    const path = dir + file;
    write(path, enrich(JSON.parse(readFileSync(path, "utf8")) as T));
    count++;
  }
  return count;
}

/** slug → type, read from the moves collection (for the machine type badges). */
function moveTypes(): Map<string, string> {
  const dir = `${GEN_DIR}moves/`;
  const types = new Map<string, string>();
  if (!existsSync(dir)) return types;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "index.json") continue;
    const m = JSON.parse(readFileSync(dir + file, "utf8")) as MoveRecord;
    types.set(m.slug, m.type);
  }
  return types;
}

export function deriveSprites() {
  // pokemon: `sprites` just before the `source` trailer.
  const pokemon = enrichCollection<PokemonRecord>("pokemon", (rec) => {
    delete rec.sprites;
    const { source, ...rest } = rec;
    return { ...rest, sprites: spritesForDex(rec.natdex), source };
  });

  // items: `sprite` before `source` (leaving the derived heldBy/foundAt trailer).
  const items = enrichCollection<ItemRecord>("items", (rec) => {
    delete rec.sprite;
    const { source, heldBy, foundAt, ...rest } = rec;
    return { ...rest, sprite: itemSprite(rec.slug), source, heldBy, foundAt };
  });

  // moves: `typeIcon` before `source` (leaving the derived learnedBy trailer).
  const moves = enrichCollection<MoveRecord>("moves", (rec) => {
    delete rec.typeIcon;
    const { source, learnedBy, ...rest } = rec;
    return { ...rest, typeIcon: typeIcon(rec.type), source, learnedBy };
  });

  // machines: `typeIcon` from each machine's move type (after moveSlug).
  const moveType = moveTypes();
  let machines = 0;
  const machinesPath = `${GEN_DIR}machines.json`;
  if (existsSync(machinesPath)) {
    const list = JSON.parse(readFileSync(machinesPath, "utf8")) as Machine[];
    const enriched = list.map((m0) => {
      const m = { ...m0 };
      delete m.typeIcon;
      const type = m.moveSlug ? moveType.get(m.moveSlug) : undefined;
      const { emerald, ...head } = m;
      return type ? { ...head, typeIcon: typeIcon(type), emerald } : { ...head, emerald };
    });
    write(machinesPath, enriched);
    machines = enriched.length;
  }

  // types: type → badge map, mirroring the type chart's types.
  let types = 0;
  const typechartPath = `${GEN_DIR}typechart.json`;
  if (existsSync(typechartPath)) {
    const chart = JSON.parse(readFileSync(typechartPath, "utf8")) as Record<string, unknown>;
    const icons: Record<string, string> = {};
    for (const type of Object.keys(chart).sort()) icons[type] = typeIcon(type);
    write(`${GEN_DIR}type-icons.json`, icons);
    types = Object.keys(icons).length;
  }

  return { pokemon, items, moves, machines, types };
}
