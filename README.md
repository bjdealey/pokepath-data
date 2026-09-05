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
node src/run.ts abilities          # derive the canonical Gen-3 abilities collection (after pokemon)
node src/run.ts natures            # scrape the 25 Gen-3 natures from Serebii (/games/natures.shtml)
node src/run.ts encounters         # scrape Emerald encounters (mon+rate+level) from pokearth
node src/run.ts items              # scrape Emerald location items (name + how obtained)
node src/run.ts itemdex            # scrape item definitions (effect+price) for those items + wild-held items (after `items`)
node src/run.ts itemlinks          # bake heldBy (wild holders) + foundAt (locations) into items (after pokemon+items+itemdex)
node src/run.ts trainers           # all trainers (gym/elite + route) + inferred story
node src/run.ts connectivity       # crawl pokearth exits → Hoenn location graph
node src/run.ts gifts              # starter trio + gift/egg/fossil Pokémon (pokearth gift tables)
node src/run.ts legendaries        # derive catchable legendaries from Pokémon Emerald locations
node src/run.ts trades             # scrape Emerald in-game trades (/emerald/trade.shtml)
node src/run.ts storypath          # enrich criticalPath with HM/legendary/key-item beats (after trainers+machines+legendaries+itemlinks)
node src/run.ts obtainability      # derive how each species is obtained in Emerald (after pokemon + game data)
node src/run.ts evtraining         # derive EV-training spots (evYield × encounters)
node src/run.ts shiny              # derive reset-able shiny targets (gifts + static legendaries)
node src/run.ts locations          # build the canonical location registry (slug → name) — run last
node src/run.ts manifest           # scan dataset/ generations → dataset/manifest.json
npm test                           # parser fixtures + dataset-integrity checks
```

**The dataset is partitioned by generation.** Canonical entities (a Pokémon's
learnset, a move's power/category, the type chart) genuinely differ per
generation, so they live under `dataset/<gen>/`, with each game nested beneath
its generation. Adding a generation later is a new subtree, not a schema change.
This scraper targets Gen 3 (Serebii's `pokedex-rs` / `attackdex` / pokearth);
the generation is set once in [`src/paths.ts`](src/paths.ts).

**Three Gen-3 games: `emerald`, `ruby`, `sapphire`** (`dataset/gen3/games/<slug>/`).
Canonical data is shared across all three; the game-scoped data is produced per
game (each `run.ts` game command loops over all three — [`src/games.ts`](src/games.ts)
holds the per-game Serebii sources). Version differences are faithful: wild
encounters split correctly (Ruby→Zangoose, Sapphire→Seviper), the box legendary
is version-exclusive (**Ruby→Groudon, Sapphire→Kyogre**), and gym/E4 teams come
from the `/rubysapphire/` pages (Ruby's Roxanne has 2 Pokémon, Emerald's 3).
In-game **trades** are parsed per game (R/S use a different page layout than
Emerald — Slakoth↔Makuhita, Pikachu↔Skitty, Bellossom↔Corsola). One documented
approximation remains: route/villain/rival trainers come from the shared pokearth
crawl (so R/S carry Emerald's route trainers + villain structure — the
gym/E4/champion spine is version-accurate).

```
dataset/
  manifest.json                                  # generations available + games + counts
  gen3/
    {pokemon,moves,items,abilities}/<slug>.json + index.json    # canonical, per-entity (static-servable)
    {machines,typechart}.json                         # canonical, Gen-3
    games/emerald/{encounters,locations,items,trainers,story,connections}.json
```

Per-entity canonical files mean the dataset can be served straight from a CDN
(`gen3/pokemon/swampert.json`) with no server; the API is only needed for
filtered queries.

**Normalization.** Each fact lives in one place and is referenced elsewhere by
`slug` (with a lightweight name/natdex kept alongside for convenience): ability
effects in `abilities/`, move type/power/effect in `moves/` (machines cite only
`moveSlug`), item definitions in `items/`, and **location display names in the
`locations` registry** — trainers, gifts and story cite a location slug, not a
repeated name. `story.criticalPath` gym beats reference a `milestone` rather than
copying its badge/TM/field-move.

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
  RSE-scoped facts (identity, i18n names, types, stats, ability **names** (→ the
  `abilities` collection, no longer duplicated inline), egg groups,
  evolution chain **+ methods** (`evolutions` edges: Level 16 / Fire Stone / Trade /
  Trade holding King's Rock / High Beauty / …, decoded from the chain's method icons —
  handles branches like Eevee, Wurmple, Slowpoke, Nincada→Shedinja), per-game
  flavor/location, full **learnset** — level-up, TM/HM, egg, and Emerald tutor moves),
  and **type effectiveness** (`damageTaken` — non-neutral weak/resist/immune multipliers),
  plus **`wildItems`** (held-when-wild) and **`evYield`** (effort points awarded when defeated —
  "Effort Points from Battling it", e.g. Swampert `{attack:3}`), parsed from `/pokedex-rs/NNN.shtml`.
- ✅ `moves` — all **Gen-III moves** (373) from the `/attackdex/` AttackDex (its
  title confirms "Generation III"): type, power, accuracy, PP, effect, secondary
  effect + rate, contest type. **Category is derived from type** (Gen 3 predates the
  physical/special split). Canonical — lives at `dataset/moves/<slug>.json`. Each move
  also carries **`learnedBy`** — which Pokémon learn it and how (level-up / TM-HM / egg /
  tutor), derived by inverting the Pokémon learnsets (`run.ts learnedby`, no network).
  349/373 moves have learners, ~20.2k links. Later-gen moves whose Gen-3 page is empty
  (0 PP, e.g. Heart Swap) are dropped. Non-standard types are handled, not dropped:
  Curse's Serebii type is mapped to Gen-3 **`???`** (typeless), and the 18 Colosseum/XD
  **Shadow** moves are tagged **`gameExclusive`** (filter with `/moves?core=true`).
- ✅ `itemdex` — item **definitions** (name, category, **In-Depth Effect**, purchase/sell
  price) for the 164 items findable in Emerald **plus the wild-held-only items** (Light Ball,
  Metal Coat, …) that no location drops (181 total), from `/itemdex/<slug>.shtml`. Canonical at
  `dataset/items/<slug>.json`; slugs match the location items — `games/emerald/items.json`
  says *where*, this says *what it does*. **The ItemDex is current-gen**, so `price` and
  `category` are the latest value (an item Serebii now files as a `Key Item` may not have
  been one in Gen 3). The **effect** is written per-generation ("In Ruby, Sapphire & Emerald,
  … In Diamond, Pearl & Platinum, …") and is **trimmed to Gen 3** at parse time — clauses that
  name only a post-Gen-3 game are dropped (removing later-gen bloat and Gen-3-wrong tails like
  a Sun/Moon catch formula), keeping the lead-in and any Gen-3 or gen-agnostic text. `itemlinks` then bakes two reverse-
  indexes into each item (no network): **`heldBy`** — the wild Pokémon that carry it + drop
  rate (inverting each Pokémon's Emerald `wildItems`) — and **`foundAt`** — the locations it's
  found at + method (inverting the location items). 45 items are held by wild Pokémon.
- ✅ `machines` — the canonical Gen-3 **TM/HM → move table** (`dataset/machines.json`,
  58 = 50 TMs + 8 HMs), derived by inverting the machine learnsets (no network). Each
  carries the move + type/category and its Emerald source (gym-badge reward or on-ground
  find) — e.g. TM39 Rock Tomb (Stone Badge), HM03 Surf (Petalburg City). **All 8 HMs have
  an obtain location** — the two NPC gifts the pokearth tables omit (HM05 Flash → Granite
  Cave, HM07 Waterfall → Cave of Origin) come from Serebii's ItemDex Locations table.
- ✅ `typechart` — the **Gen-3 17×17 type effectiveness chart** (`dataset/typechart.json`,
  `chart[attacking][defending]`), derived from the pure-type Pokémon's `damageTaken` (no
  network). Gen-3-accurate: Steel resists Ghost/Dark. Flying (no pure Gen-3 rep) is
  derived from a Bug/Flying mon. Verified against known matchups.
- ✅ `abilities` — the canonical **Gen-3 abilities** collection (`dataset/abilities/<slug>.json`,
  76), *derived* (no network) by aggregating each Pokémon's ability text and keeping the most
  common wording with the Pokémon name genericized ("The Pokémon receives no Re-Coil Damage").
  **Game-specific**: Serebii's live AbilityDex is current-gen (its Sturdy is the Gen-5 effect),
  so this is built from the Gen-3 pokedex pages instead — Sturdy here is the Gen-3 "OHKO moves
  fail". Pokémon reference abilities by name; the effect lives here once, not duplicated per mon.
  Each ability also carries **`pokemon`** — the reverse-index of which Pokémon can have it (like
  a move's `learnedBy`), derived in the same pass.
- ✅ `natures` — the **25 Gen-3 natures** (`dataset/natures.json`): each raises one stat 10% and
  lowers another (five are neutral, HP never affected). Scraped from Serebii's `/games/natures.shtml`
  (so every record carries a Serebii `source`) — reference data for competitive/training calculators.
- ✅ `obtainability` — **how each species is obtained in Emerald** (`games/emerald/obtainability.json`,
  *derived*, no network): per species — wild spots, the evolution edge into it, breeding eligibility,
  gift/trade/event flags, and a **transitive `obtainable`** (reachable via a direct source, or evolves
  from an obtainable species — e.g. Charizard is `false`, since the Charmander line needs a trade in
  Emerald). 231/386 obtainable in-game. Powers living-dex / completionist planning.
- ✅ `evtraining` — **EV-training spots** (`games/emerald/ev-training.json`, *derived*): per stat, the
  wild species that award that EV (`evYield` × encounters) and where to grind them — sorted best-first
  (points, then encounter rate). 144 entries across the 6 stats. Powers training.
- ✅ `shiny` — **reset-able shiny targets** (`games/emerald/shiny-targets.json`, *derived*): the
  static/gift encounters you can soft-reset for a shiny (3 starters + 8 gifts + 6 static legendaries).
  Gen-3 odds are a fixed 1/8192 (no methods/charm), so wild species are hunted via `encounters`; these
  are the SR-able ones. Powers shiny hunting.
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
- ✅ `story` — `{ milestones, locations, criticalPath }`. **milestones** = the fixed
  13-step gym → Elite Four → Champion spine (order, city, badge, TM, field-move unlock
  from the gym "Method" prose — Stone→Cut, Balance→Surf, …, level cap). **locations** =
  every location placed in an *inferred* order by its median trainer level (or encounter
  level), pegged to the gym level-cap `phase`. **criticalPath** = the 60-beat playthrough:
  the battle spine (gyms + Team Aqua/Magma confrontations + rival battles) **interleaved
  with the non-battle progression** — `hm` beats (where you obtain each field move), `item`
  beats (key items with a findable location), and `legendary` beats (in-Hoenn legendaries) —
  every beat ordered by `levelCap` and tied to a location slug (`storypath` derive, no network).
  Every beat carries a **`necessity`**: **`required`** = the definitional mandatory spine (the 13
  gym/E4/champion beats — badges + League, for speedrun / minimum-route planning), **`optional`** =
  skippable side content (legendaries), **`supporting`** = on the path but not derivably classified
  either way (villain/rival battles, HM pickups, key items — finer forced-battle data isn't in
  Serebii). All three are **heuristic** ordering (Serebii has no
  walkthrough page), not canonical — a beat's level is a story-order proxy. Legendaries are the
  exception to level-placement: a static legendary isn't a grass encounter, so its area's wild
  level would misplace it — they're grouped as an **optional cluster after the champion** (their
  areas are late/post-game and Serebii gives no static-encounter level to time them precisely).
  Route-gating (which HM a route needs) lives on the connections graph, not here.
- ✅ `connectivity` — the **Hoenn map graph** (`games/emerald/connections.json`): each
  location → `{ name, exits: { direction → location }, fieldMoves }`, from the pokearth
  pages' exit links (`North Exit: Oldale Town`). Taken from the ORAS pages (the 3rd-gen
  pages omit exits; Hoenn's topology is identical across games). **`fieldMoves`** = the
  HMs Serebii lists as *used* at that location (from the Emerald `/3rd/` page's "Special
  Moves used in …" — 40/58 locations) — the route-gating layer for "clear this route with
  Surf/Cut/…"; note it includes optional-access uses, not only mandatory passage. A curated overlay adds the
  connections the ORAS exit links omit — **Dive** into Sootopolis, the **SS Tidal**
  and **Eon-ticket ferries** (Battle Frontier, Southern Island), and a couple of cave
  entrances — keyed by travel mode (`dive`/`boat`/`ferry`). Result: **58 locations,
  127 edges, every location reachable from Littleroot** (start→finish routable) — a
  real adjacency graph for pathfinding, complementing the level-inferred story order.
- ✅ `gifts` — **Pokémon obtained outside wild grass** (`games/emerald/gifts.json`),
  from the pokearth "Gift - Emerald" tables: the **starter trio** (Treecko/Torchic/
  Mudkip, method `starter`), plus one-off gifts — the post-game Johto starter choice,
  the **Wynaut egg**, **Beldum**, **Castform**, and the revived **fossils** (Lileep,
  Anorith). 11 entries with `{ pokemon, method, level, location }`. Wild-grass catches
  stay in `encounters`; this is the interaction/gift layer.
- ✅ `legendaries` — the **catchable legendaries/mythicals** (`games/emerald/
  legendaries.json`, 13), *derived* (no network) from each Pokémon's pokedex-rs Emerald
  location text: `static` (Regis, Kyogre @ Marine Cave, Groudon @ Terra Cave, Rayquaza),
  `roaming` (Latias/Latios), `event` (Mew, Ho-Oh/Lugia @ Navel Rock, Deoxys, Jirachi).
- ✅ `trades` — the **in-game trades** (`games/emerald/trades.json`, 3) from
  `/emerald/trade.shtml`: give→receive species + held mail (Volbeat→Plusle, Bagon→Horsea,
  Skitty→Meowth) — a way to get mons not otherwise in Hoenn (Horsea, Meowth).
- ⏳ Next: other generations (new `dataset/gen4/…` subtree + gen-specific sources).

## Notes

- Scraping is throttled and cached; use responsibly. Keep the dataset in a
  **private** repo (Serebii ToS).
- `cache/` is gitignored (raw HTML); `dataset/` is committed (the product).
