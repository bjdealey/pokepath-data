// Derive the canonical Gen-3 abilities collection by aggregating the per-Pokémon
// ability text from the pokedex-rs pages (game-specific — the current-gen
// AbilityDex describes later-gen effects, e.g. Gen-5 Sturdy). No network: re-reads
// the cached pages. Abilities are keyed by slug (Serebii spells a few several ways,
// e.g. "Compound Eyes" / "Compoundeyes"); for each, the most common name + effect
// wins, with the Pokémon name genericized to "the Pokémon". Also normalizes the
// Pokémon files' ability names to the canonical spelling. Run after `pokemon`.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GEN_DIR as DATASET } from "../paths.ts";
import { parsePokemon } from "../parse/pokemon.ts";
import type { AbilityRecord, PokemonRecord } from "../types.ts";

const CACHE = fileURLToPath(new URL("../../cache/www.serebii.net/pokedex-rs/", import.meta.url));
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const genericize = (name: string, d: string) =>
  d
    .replace(new RegExp(esc(name) + "[’']s\\b", "gi"), "the Pokémon’s")
    .replace(new RegExp(esc(name) + "[’'](?!\\w)", "gi"), "the Pokémon’s")
    .replace(new RegExp("\\b" + esc(name) + "\\b", "gi"), "the Pokémon")
    .replace(/\s+/g, " ")
    .trim();
const mode = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

export function deriveAbilities() {
  const pdir = `${DATASET}pokemon/`;
  const files = readdirSync(pdir).filter((x) => x.endsWith(".json") && x !== "index.json");
  // slug → tallies of name spellings + genericized effects
  const tally = new Map<string, { names: Map<string, number>; effects: Map<string, number> }>();
  const holders = new Map<string, Array<{ slug: string; natdex: number }>>(); // ability slug → Pokémon
  const parsedNames = new Map<string, string[]>(); // pokemon file → ability names (raw), for the rename pass
  for (const f of files) {
    const rec = JSON.parse(readFileSync(pdir + f, "utf8")) as PokemonRecord;
    let parsed;
    try {
      parsed = parsePokemon(readFileSync(`${CACHE}${String(rec.natdex).padStart(3, "0")}.shtml.html`, "utf8"), rec.source?.url ?? "");
    } catch {
      continue;
    }
    parsedNames.set(f, parsed.record.abilities);
    for (const name of parsed.record.abilities) {
      const slug = slugify(name);
      const t = tally.get(slug) ?? { names: new Map(), effects: new Map() };
      tally.set(slug, t);
      t.names.set(name, (t.names.get(name) ?? 0) + 1);
      const list = holders.get(slug) ?? [];
      if (!holders.has(slug)) holders.set(slug, list);
      list.push({ slug: rec.slug, natdex: rec.natdex });
      const raw = parsed.abilityDesc[name];
      if (raw) {
        const g = genericize(parsed.record.name, raw);
        t.effects.set(g, (t.effects.get(g) ?? 0) + 1);
      }
    }
  }

  const canonName = new Map<string, string>(); // slug → canonical name spelling
  const records: AbilityRecord[] = [...tally].map(([slug, t]) => {
    const name = mode(t.names);
    canonName.set(slug, name);
    const e = mode(t.effects);
    const pokemon = (holders.get(slug) ?? []).sort((a, b) => a.natdex - b.natdex);
    return { slug, name, effect: e ? e[0]!.toUpperCase() + e.slice(1) : "", pokemon };
  });
  records.sort((a, b) => a.name.localeCompare(b.name));

  const dir = `${DATASET}abilities/`;
  mkdirSync(dir, { recursive: true });
  for (const r of records) writeFileSync(`${dir}${r.slug}.json`, JSON.stringify(r, null, 2));
  writeFileSync(`${dir}index.json`, JSON.stringify(records.map((r) => ({ slug: r.slug, name: r.name })), null, 2));

  // Normalize each Pokémon's ability names to the canonical spelling.
  let renamed = 0;
  for (const f of files) {
    const names = parsedNames.get(f);
    if (!names) continue;
    const rec = JSON.parse(readFileSync(pdir + f, "utf8")) as PokemonRecord;
    const canon = names.map((n) => canonName.get(slugify(n)) ?? n);
    if (JSON.stringify(rec.abilities) !== JSON.stringify(canon)) {
      rec.abilities = canon;
      writeFileSync(pdir + f, JSON.stringify(rec, null, 2));
      renamed++;
    }
  }
  return { abilities: records.length, withEffect: records.filter((r) => r.effect).length, renamed };
}
