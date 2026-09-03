# pokepath-data

Scrapes **serebii.net** into a canonical JSON dataset for the pokepath ecosystem
(consumed via [`pokepath-api`](../pokepath-api)). Serebii is the **single source** —
one owned, self-consistent dataset, no cross-source ID reconciliation.

## Run

```bash
npm install
node src/run.ts pokemon            # default slice: Emerald opening (#252–265)
node src/run.ts pokemon 1-386      # full national dex (Gen-3 pages)
node src/run.ts pokemon 252,255    # explicit list
node src/run.ts pokemon 1-151 --refresh   # bypass cache
node src/run.ts moves              # scrape all Gen-III moves (attackdex); `moves 20` = first 20
node src/run.ts encounters         # scrape Emerald encounters (mon+rate+level) from pokearth
node src/run.ts items              # scrape Emerald location items (name + how obtained)
node src/run.ts trainers           # all trainers (gym/elite + route) + inferred story
npm test                           # parser fixture tests
```

Output → canonical `dataset/pokemon/<slug>.json` and `dataset/moves/<slug>.json`
(each with an `index.json`), plus game-scoped
`dataset/games/<game>/{encounters,locations,items,trainers,story}.json`.

## How it works

```
fetch.ts    cache-first GET (cache/ is gitignored), 1 req at a time + 1.5s delay
decode.ts   repairs Serebii's mixed UTF-8 / Windows-1252 bytes ("Pokémon")
parse/*.ts  one module per Serebii page-type; sections keyed by title row,
            per-game data keyed by game label — stable across the RSE-era pages
run.ts      drives fetch → parse → emit, resolves evolution chains to slugs
```

Every page is cached on first fetch; parsing re-runs offline with zero network.
Each parser is pinned by a fixture test against a committed real page, so a
Serebii layout change fails loudly instead of silently corrupting the dataset.

## Status

- ✅ `pokemon` — **full national dex, #001–386 (386 species)**. Canonical +
  RSE-scoped facts (identity, i18n names, types, stats, abilities, egg groups,
  evolution chain, per-game flavor/location, level-up + TM/HM learnset), parsed
  from `/pokedex-rs/NNN.shtml`.
- ✅ `moves` — all **Gen-III moves** (~355) from the `/attackdex/` AttackDex (its
  title confirms "Generation III"): type, power, accuracy, PP, effect, secondary
  effect + rate, contest type. **Category is derived from type** (Gen 3 predates the
  physical/special split). Canonical — lives at `dataset/moves/<slug>.json`.
- ✅ `encounters` — **Emerald**, scraped from the Hoenn `/pokearth/hoenn/3rd/`
  Emerald encounter tables (`table.dextable` with a `td.emerald` header — distinct
  from the Ruby/Sapphire `table.extradextable`). Per location: mon + **rate% + level
  range + method** (grass / surf / old-·good-·super-rod / rock-smash), method resolved
  from document-order anchors. 61 locations (34 routes + caves/special), 607
  encounters. Route 110 correctly lists both Plusle *and* Minun with rates.
- ✅ `items` — **Emerald** findable items per location, from the same pokearth pages
  (item + how obtained: Floor / Itemfinder-hidden / Gift / Berry Tree). 51 locations,
  304 items; item slugs come from Serebii's itemdex links.
- ✅ `trainers` — **every Emerald trainer in one file** (780), tagged `kind`:
  `gym-leader` / `elite-four` / `champion` (from `/emerald/gym.shtml`+`elite.shtml`,
  **with movesets + held items** and badge/field-move metadata) and `rival` / `villain`
  / `trainer` (all 700+ route trainers from the pokearth `trainers-em` sections, team +
  level). Rival keeps its **starter-choice variants**; exact-duplicate tables de-duped.
- ✅ `story` — `{ milestones, locations }`. **milestones** = the fixed 13-step gym →
  Elite Four → Champion spine (order, city, badge, TM, field-move unlock from the gym
  "Method" prose — Stone→Cut, Balance→Surf, …, level cap). **locations** = every
  location placed in an *inferred* order by its median trainer level (or encounter
  level), pegged to the gym level-cap `phase`. Heuristic, not canonical — Route 101
  (L3) → … → Evergrande City (L52).
- ⏳ Next: other generations; optional Ruby/Sapphire level enrichment for encounters
  from `/pokearth/hoenn/3rd/`.

## Notes

- Scraping is throttled and cached; use responsibly. Keep the dataset in a
  **private** repo (Serebii ToS).
- `cache/` is gitignored (raw HTML); `dataset/` is committed (the product).
