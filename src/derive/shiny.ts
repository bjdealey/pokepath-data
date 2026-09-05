// Derive the reset-able shiny targets: the static/gift encounters you can
// soft-reset for a shiny (starters, gifts, static legendaries). Gen 3 has no
// shiny methods/charm — fixed 1/8192 odds — so wild species are hunted via
// random encounters (use `encounters`); these are the SR-able ones. No network.
// Emits games/emerald/shiny-targets.json. Run after `gifts` + `legendaries`.
import { readFileSync, writeFileSync } from "node:fs";
import { GEN_DIR as DATASET } from "../paths.ts";
import type { Gift, Legendary, ShinyTarget } from "../types.ts";

const G = `${DATASET}games/emerald/`;

export function deriveShiny() {
  const gifts = JSON.parse(readFileSync(`${G}gifts.json`, "utf8")) as Gift[];
  const legs = JSON.parse(readFileSync(`${G}legendaries.json`, "utf8")) as Legendary[];

  const targets: ShinyTarget[] = [];
  for (const g of gifts) targets.push({ pokemon: g.pokemon, natdex: g.natdex, method: g.method === "starter" ? "starter" : "gift", location: g.location });
  for (const l of legs) if (l.method === "static") targets.push({ pokemon: l.pokemon, natdex: l.natdex, method: "static-legendary", location: l.location });
  targets.sort((a, b) => a.natdex - b.natdex);

  writeFileSync(`${G}shiny-targets.json`, JSON.stringify(targets, null, 2));
  const byMethod = targets.reduce<Record<string, number>>((m, t) => ((m[t.method] = (m[t.method] ?? 0) + 1), m), {});
  return { targets: targets.length, byMethod };
}
