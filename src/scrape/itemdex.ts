// Scrape ItemDex definitions (effect + price + category) for the items findable
// in Emerald — the slug list comes from the location items (games/emerald/
// items.json), so run `items` first. Canonical, so output lives at
// dataset/items/<slug>.json (distinct from the per-location games/*/items.json).
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import { fetchCached } from "../fetch.ts";
import { parseItem } from "../parse/item.ts";
import type { ItemRecord, PokemonRecord } from "../types.ts";

const itemUrl = (slug: string) => `https://www.serebii.net/itemdex/${slug}.shtml`;
const concatSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// Serebii's ItemDex keys some items by a dotted slug (exp.share, guardspec.) or
// by their modern name — the Gen-3 name the pokearth pages link to 404s. Map the
// clean location slug to the real ItemDex slug; the record is still keyed by the
// location slug so it joins games/emerald/items.json. (Verified against the
// /itemdex/ index; the record's effect/price is current-gen where the item was
// renamed, consistent with the rest of the ItemDex.)
const ITEMDEX_SLUG: Record<string, string> = {
  "exp-share": "exp.share",
  "guard-spec": "guardspec.",
  parlyzheal: "paralyzeheal", // → Paralyze Heal
  xdefend: "xdefense", // → X Defense
  xspecial: "xsp.atk", // → X Sp. Atk
  nevermeltice: "never-meltice",
};

export async function scrapeItemdex(refresh = false) {
  const locPath = `${DATASET}games/emerald/items.json`;
  if (!existsSync(locPath)) throw new Error("run `items` first — needs games/emerald/items.json for the slug list");
  const loc = JSON.parse(await readFile(locPath, "utf8")) as Record<string, { items: Array<{ slug: string }> }>;
  const slugs = [...new Set(Object.values(loc).flatMap((l) => l.items.map((i) => i.slug)))].sort();

  const items: ItemRecord[] = [];
  const missing: string[] = [];
  const seenName = new Set<string>();
  // Fetch one ItemDex page. Location slugs are sometimes slugified names
  // (king-s-rock); the ItemDex uses concatenated slugs (kingsrock). Try the
  // known override, then the slug itself, then the de-hyphenated form, on 404.
  // Key the stored record by `keySlug` (the location slug, so it joins the
  // per-location items). Dedupe by name so a held-only item that's also findable
  // isn't stored twice under two slug spellings.
  const fetchItem = async (fetchSlug: string, keySlug: string) => {
    let html: string | undefined;
    for (const candidate of [ITEMDEX_SLUG[fetchSlug], fetchSlug, fetchSlug.replace(/-/g, "")]) {
      if (!candidate) continue;
      try {
        html = await fetchCached(itemUrl(candidate), { refresh });
        break;
      } catch {
        /* try next candidate */
      }
    }
    if (!html) {
      missing.push(keySlug);
      return;
    }
    const item = parseItem(html, itemUrl(keySlug));
    if (item.name && !seenName.has(item.name.toLowerCase())) {
      seenName.add(item.name.toLowerCase());
      items.push(item);
    }
  };

  for (const slug of slugs) await fetchItem(slug, slug);

  // Held-only items (Light Ball, Metal Coat, …): wild Pokémon carry them but
  // they're not findable on the ground, so they're absent from the location
  // slug list. Pull them in (keyed by their concatenated ItemDex slug) so
  // items.heldBy resolves. Names already covered by a location are skipped.
  const pdir = `${DATASET}pokemon/`;
  const heldNames = new Set<string>();
  for (const f of readdirSync(pdir)) {
    if (!f.endsWith(".json") || f === "index.json") continue;
    for (const w of (JSON.parse(readFileSync(pdir + f, "utf8")) as PokemonRecord).wildItems ?? []) heldNames.add(w.item);
  }
  for (const name of [...heldNames].sort()) {
    if (seenName.has(name.toLowerCase())) continue;
    await fetchItem(concatSlug(name), concatSlug(name));
  }
  if (missing.length) console.warn(`⚠ no ItemDex page for ${missing.length}: ${missing.join(", ")}`);

  const dir = `${DATASET}items/`;
  await mkdir(dir, { recursive: true });
  for (const it of items) await writeFile(`${dir}${it.slug}.json`, JSON.stringify(it, null, 2));
  items.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(
    `${dir}index.json`,
    JSON.stringify(items.map((i) => ({ slug: i.slug, name: i.name, category: i.category, price: i.price })), null, 2),
  );

  return { items: items.length, slugs: slugs.length };
}
