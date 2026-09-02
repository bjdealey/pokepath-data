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
node src/run.ts encounters         # scrape Emerald encounters (mon+rate+level) from pokearth
node src/run.ts trainers           # scrape Emerald gyms + Elite Four → trainers + story
node src/run.ts battles            # crawl Hoenn pokearth → Emerald rival/villain battles
npm test                           # parser fixture tests
```

Output → `dataset/pokemon/<slug>.json` + `index.json` + `meta.json`, and
`dataset/games/<game>/{encounters,locations,trainers,story,battles}.json`.

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
- ✅ `encounters` — **Emerald**, scraped from the Hoenn `/pokearth/hoenn/3rd/`
  Emerald encounter tables (`table.dextable` with a `td.emerald` header — distinct
  from the Ruby/Sapphire `table.extradextable`). Per location: mon + **rate% + level
  range + method** (grass / surf / old-·good-·super-rod / rock-smash), method resolved
  from document-order anchors. 61 locations (34 routes + caves/special), 607
  encounters. Route 110 correctly lists both Plusle *and* Minun with rates.
- ✅ `trainers` + `story` — **Emerald** gym leaders + Elite Four + Champion rosters
  (Pokémon, level, moves, held item), and a 13-step **progression spine** (gym order,
  city, badge, TM reward, field-move unlock, level cap) from `/emerald/gym.shtml` +
  `/emerald/elite.shtml`. The gym "Method" prose even states which HM each badge
  unlocks (Stone→Cut, Balance→Surf, …).
- ✅ `battles` — **Emerald** rival (Brendan / May / Wally) + villain (Team Magma /
  Aqua: Maxie, admins, grunts) battles, crawled from the Hoenn `/pokearth/hoenn/3rd/`
  pages (Emerald `trainers-em` sections only, isolated via document-order anchors).
  82 battles across 76 pages; captures the rival's **starter-choice variants**
  (Mudkip chosen → Grovyle ace, …). Team + level only — pokearth omits movesets/items.
- ⏳ Next: other generations; optional Ruby/Sapphire level enrichment for encounters
  from `/pokearth/hoenn/3rd/`.

## Notes

- Scraping is throttled and cached; use responsibly. Keep the dataset in a
  **private** repo (Serebii ToS).
- `cache/` is gitignored (raw HTML); `dataset/` is committed (the product).
