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
node src/run.ts learnedby          # bake move→Pokémon reverse index into moves (after pokemon+moves)
node src/run.ts machines           # derive TM/HM → move table (after pokemon; +moves/story/items enrich)
node src/run.ts typechart          # derive the Gen-3 type chart from Pokémon damage-taken (after pokemon)
node src/run.ts encounters         # scrape Emerald encounters (mon+rate+level) from pokearth
node src/run.ts items              # scrape Emerald location items (name + how obtained)
node src/run.ts itemdex            # scrape item definitions (effect+price) for those items (after `items`)
node src/run.ts trainers           # all trainers (gym/elite + route) + inferred story
node src/run.ts connectivity       # crawl pokearth exits → Hoenn location graph
npm test                           # parser fixture tests
```

Output → canonical `dataset/{pokemon,moves,items}/<slug>.json` (each with an
`index.json`) + `dataset/{machines,typechart}.json`, plus game-scoped
`dataset/games/<game>/{encounters,locations,items,trainers,story,connections}.json`.

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
  evolution chain **+ methods** (`evolutions` edges: Level 16 / Fire Stone / Trade /
  Trade holding King's Rock / High Beauty / …, decoded from the chain's method icons —
  handles branches like Eevee, Wurmple, Slowpoke, Nincada→Shedinja), per-game
  flavor/location, full **learnset** — level-up, TM/HM, egg, and Emerald tutor moves),
  and **type effectiveness** (`damageTaken` — non-neutral weak/resist/immune multipliers),
  parsed from `/pokedex-rs/NNN.shtml`.
- ✅ `moves` — all **Gen-III moves** (~355) from the `/attackdex/` AttackDex (its
  title confirms "Generation III"): type, power, accuracy, PP, effect, secondary
  effect + rate, contest type. **Category is derived from type** (Gen 3 predates the
  physical/special split). Canonical — lives at `dataset/moves/<slug>.json`. Each move
  also carries **`learnedBy`** — which Pokémon learn it and how (level-up / TM-HM / egg /
  tutor), derived by inverting the Pokémon learnsets (`run.ts learnedby`, no network).
  348/374 moves have learners, ~20.2k links.
- ✅ `itemdex` — item **definitions** (name, category, **In-Depth Effect**, purchase/sell
  price) for the 164 items findable in Emerald, from `/itemdex/<slug>.shtml`. Canonical at
  `dataset/items/<slug>.json`; slugs match the location items — `games/emerald/items.json`
  says *where*, this says *what it does*. Price is Serebii's ItemDex value (not gen-scoped,
  so latest where an item's price changed across gens).
- ✅ `machines` — the canonical Gen-3 **TM/HM → move table** (`dataset/machines.json`,
  58 = 50 TMs + 8 HMs), derived by inverting the machine learnsets (no network). Each
  carries the move + type/category and its Emerald source (gym-badge reward or on-ground
  find) — e.g. TM39 Rock Tomb (Stone Badge), HM03 Surf (Petalburg City).
- ✅ `typechart` — the **Gen-3 17×17 type effectiveness chart** (`dataset/typechart.json`,
  `chart[attacking][defending]`), derived from the pure-type Pokémon's `damageTaken` (no
  network). Gen-3-accurate: Steel resists Ghost/Dark. Flying (no pure Gen-3 rep) is
  derived from a Bug/Flying mon. Verified against known matchups.
- ✅ `encounters` — **Emerald**, scraped from the Hoenn `/pokearth/hoenn/3rd/`
  Emerald encounter tables (`table.dextable` with a `td.emerald` header — distinct
  from the Ruby/Sapphire `table.extradextable`). Per location: mon + **rate% + level
  range + method** (grass / surf / old-·good-·super-rod / rock-smash), method resolved
  from document-order anchors. 61 locations (34 routes + caves/special), 607
  encounters. Route 110 correctly lists both Plusle *and* Minun with rates.
- ✅ `items` — **Emerald** findable items per location, from the same pokearth pages
  (item + how obtained: Floor / Itemfinder-hidden / Gift / Berry Tree). 51 locations,
  304 items; item slugs come from Serebii's itemdex links.
- ✅ `trainers` — **every Emerald trainer battle in one file** (780), tagged `kind`:
  `gym-leader` / `elite-four` / `champion` (from `/emerald/gym.shtml`+`elite.shtml`,
  **with movesets + held items** and badge/field-move metadata — every moveset move
  name resolves to a move record, with post-Gen-3 gym-page names aliased back, e.g.
  Feint→Faint Attack) and `rival` / `villain`
  / `trainer` (all 650+ route trainers from the pokearth `trainers-em` sections, team +
  level). Rival keeps its **starter-choice variants**; exact-duplicate tables de-duped.
  Each row is a distinct battle with a **unique `slug`**; a trainer's rematch tiers /
  story battles share a `trainer` identity (the canonical gym battle is `roxanne`,
  rematches `roxanne-2…`), so `?trainer=roxanne` regroups them. Pokearth city pages
  re-list the gym leaders / E4 / champion as escalating rematch tiers — those are
  reclassified to their real `kind` and merged onto the gym-page identity (not left
  mis-tagged `trainer`).
- ✅ `story` — `{ milestones, locations }`. **milestones** = the fixed 13-step gym →
  Elite Four → Champion spine (order, city, badge, TM, field-move unlock from the gym
  "Method" prose — Stone→Cut, Balance→Surf, …, level cap). **locations** = every
  location placed in an *inferred* order by its median trainer level (or encounter
  level), pegged to the gym level-cap `phase`. Heuristic, not canonical — Route 101
  (L3) → … → Evergrande City (L52).
- ✅ `connectivity` — the **Hoenn map graph** (`games/emerald/connections.json`): each
  location → `{ name, exits: { direction → location } }`, from the pokearth pages' exit
  links (`North Exit: Oldale Town`). Taken from the ORAS pages (the 3rd-gen pages omit
  exits; Hoenn's topology is identical across games). A real adjacency graph for
  pathfinding — complements the level-inferred story order.
- ⏳ Next: other generations; optional Ruby/Sapphire level enrichment for encounters
  from `/pokearth/hoenn/3rd/`.

## Notes

- Scraping is throttled and cached; use responsibly. Keep the dataset in a
  **private** repo (Serebii ToS).
- `cache/` is gitignored (raw HTML); `dataset/` is committed (the product).
