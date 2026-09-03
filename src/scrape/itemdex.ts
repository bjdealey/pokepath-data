// Scrape ItemDex definitions (effect + price + category) for the items findable
// in Emerald — the slug list comes from the location items (games/emerald/
// items.json), so run `items` first. Canonical, so output lives at
// dataset/items/<slug>.json (distinct from the per-location games/*/items.json).
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchCached } from "../fetch.ts";
import { parseItem } from "../parse/item.ts";
import type { ItemRecord } from "../types.ts";

const DATASET = fileURLToPath(new URL("../../dataset/", import.meta.url));
const itemUrl = (slug: string) => `https://www.serebii.net/itemdex/${slug}.shtml`;

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
  for (const slug of slugs) {
    // Location slugs are sometimes slugified names (king-s-rock); the ItemDex
    // uses concatenated slugs (kingsrock). Try the known override, then the slug
    // itself, then the de-hyphenated form, on 404.
    let html: string | undefined;
    for (const candidate of [ITEMDEX_SLUG[slug], slug, slug.replace(/-/g, "")]) {
      if (!candidate) continue;
      try {
        html = await fetchCached(itemUrl(candidate), { refresh });
        break;
      } catch {
        /* try next candidate */
      }
    }
    if (!html) {
      missing.push(slug);
      continue;
    }
    // Key the record by the location slug so it joins the per-location items.
    const item = parseItem(html, itemUrl(slug));
    if (item.name) items.push(item);
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
