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
npm test                           # parser fixture tests
```

Output → `dataset/pokemon/<slug>.json` + `index.json` + `meta.json`.

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

- ✅ `pokemon` — canonical + RSE-scoped facts (identity, i18n names, types,
  stats, abilities, egg groups, evolution chain, per-game flavor/location,
  level-up + TM/HM learnset), parsed from `/pokedex-rs/NNN.shtml`.
- ⏳ Next: `encounters` (per-game location pages — **not** modern `/pokearth/`,
  which is ORAS-only), `trainers`, `story`, then other generations.

## Notes

- Scraping is throttled and cached; use responsibly. Keep the dataset in a
  **private** repo (Serebii ToS).
- `cache/` is gitignored (raw HTML); `dataset/` is committed (the product).
