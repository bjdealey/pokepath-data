// Dataset record shapes — the contract every consumer (pokepath, pokefolio,
// pokeroute, ...) reads. Canonical entities are game-agnostic; game-scoped
// facts (locations, flavor, learnset) are keyed by game slug.

export type GameSlug =
  | "ruby" | "sapphire" | "emerald" | "firered" | "leafgreen"
  | "colosseum" | "xd";

/** A canonical Gen-3 ability definition (derived by aggregating the per-Pokémon
 * ability text from the pokedex-rs pages — game-specific, unlike the current-gen
 * AbilityDex). Pokémon reference these by name in `PokemonRecord.abilities`. */
export interface AbilityRecord {
  slug: string;
  name: string;
  effect: string; // generic effect ("the Pokémon …"), the most common wording across its Pokémon
  pokemon: Array<{ slug: string; natdex: number }>; // Pokémon that can have this ability (like a move's learnedBy)
}

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
  total: number;
}

export interface LevelUpMove {
  level: number | null; // null = learned at start / by evolution ("—")
  move: string;
}

export interface MachineMove {
  machine: string; // "TM06", "HM01"
  move: string;
}

export interface Learnset {
  levelUp: LevelUpMove[];
  machine: MachineMove[];
  egg: string[]; // egg move names
  tutor: string[]; // move-tutor names (Emerald-applicable)
}

/** The canonical Gen-3 TM/HM → move table (derived from the learnsets), with
 * the move's details and where it's obtained in Emerald. */
export interface Machine {
  machine: string; // "TM06" / "HM01"
  kind: "TM" | "HM";
  number: number;
  move: string; // move name (a label); its type/category/effect live in moves/<moveSlug>.json
  moveSlug: string | null;
  emerald: { badge?: string; locations: Array<{ location: string; method: string }> };
}

/** How a Pokémon learns a move (derived by inverting the Pokémon learnsets). */
export interface LearnedByEntry {
  pokemon: string; // slug
  natdex: number;
  method: "level-up" | "machine" | "egg" | "tutor";
  level?: number | null; // for level-up (null = start/evolution)
  machine?: string; // for machine (TM/HM)
}

/** A move from the Gen-III AttackDex. Category is derived from type — Gen 3
 * predates the physical/special split (that was per-type, not per-move). */
export interface MoveRecord {
  slug: string;
  name: string;
  type: string;
  category: "physical" | "special" | "status";
  power: number | null; // null = status or variable power
  accuracy: number | null; // null = never misses
  pp: number;
  effect: string; // battle effect description
  secondaryEffect?: string;
  effectRate: number | null; // % chance of the secondary effect
  contestType?: string;
  gameExclusive?: boolean; // true = side-game only (Colosseum/XD Shadow moves), not obtainable in the core Gen-3 games
  learnedBy?: LearnedByEntry[]; // derived: Pokémon that learn this move (level-up + TM/HM)
  source: { url: string; scrapedAt: string };
}

export interface TrainerPokemon {
  pokemon: string; // slug
  natdex: number;
  level: number;
  moves?: string[]; // gym/elite pages carry movesets; pokearth route trainers don't
  heldItem?: string | null;
}

/** Every trainer, from any source, in one shape. `kind` distinguishes the
 * marquee battles (gym-leader/elite-four/champion, from the gym/elite pages,
 * with movesets) from pokearth route trainers (rival/villain/trainer). */
export interface Trainer {
  slug: string; // unique per battle (a trainer with N battles gets slug, slug-2, …)
  trainer: string; // shared identity slug across a trainer's battles (rematches/story tiers regroup on this)
  label: string; // "Roxanne" / "Youngster Timmy" / "Pokémon Trainer Brendan"
  kind: "gym-leader" | "elite-four" | "champion" | "rival" | "villain" | "trainer";
  location: string; // slug (display name is in the locations registry)
  order?: number; // gym/elite/champion sequence
  specialty?: string; // type
  badge?: string;
  tmReward?: string;
  fieldMove?: string; // HM this badge unlocks
  variant?: string; // rival starter condition, e.g. "Mudkip Chosen"
  team: TrainerPokemon[];
}

/** An item findable at a location (name + how it's obtained). */
export interface LocationItem {
  item: string;
  slug: string;
  method: string; // Floor | Itemfinder | Hidden | Gift | …
}

/** A canonical item definition from the ItemDex (effect + price + category). */
export interface ItemRecord {
  slug: string;
  name: string;
  category: string; // "Item Type": Recovery / Poké Balls / Berries / Hold item / TM / Key item …
  effect: string; // "In-Depth Effect"
  price: number | null; // purchase price (Serebii ItemDex; not gen-scoped — latest where prices vary)
  sellPrice: number | null;
  heldBy?: Array<{ pokemon: string; natdex: number; rate: number }>; // derived: wild Pokémon that hold this item
  foundAt?: Array<{ location: string; method: string }>; // derived: Emerald locations where it's found
  source: { url: string; scrapedAt: string };
}

/** A Pokémon obtained outside wild grass — the starter (Prof Birch's choice of
 * three) or a one-off gift/egg — from a pokearth page's "Gift - Emerald" table. */
export interface Gift {
  pokemon: string; // slug
  natdex: number;
  method: "starter" | "gift"; // starter = the choosable trio; gift = a one-off handout/egg
  level: number | null;
  location: string; // slug (display name is in the locations registry)
}

/** The canonical location registry: slug → display name, for every location the
 * game data references. Trainers/gifts/story cite a slug; the name lives here. */
export interface LocationRecord {
  slug: string;
  name: string;
}

/** A static / roaming / event legendary, derived from a Pokémon's pokedex-rs
 * Emerald location text (no network). `location` is Serebii's prose. */
export interface Legendary {
  pokemon: string; // slug
  natdex: number;
  method: "static" | "roaming" | "event";
  location: string; // e.g. "Marine Cave", "Faraway Island", "Wild in Hoenn after…"
}

/** An in-game trade (you give one species, receive another — often holding mail),
 * from /emerald/trade.shtml. A way to obtain mons not otherwise in Hoenn. */
export interface InGameTrade {
  give: { pokemon: string; natdex: number };
  receive: { pokemon: string; natdex: number; heldItem: string | null };
}

/** A wild encounter from an Emerald pokearth encounter table (mon + rate + level). */
export interface EmeraldEncounter {
  pokemon: string;
  natdex: number;
  method: string; // grass | surf | old-rod | good-rod | super-rod | rock-smash
  rate: number | null; // percent chance
  levelMin: number | null;
  levelMax: number | null;
}

/** A fixed progression node (gyms → Elite Four → Champion). */
export interface StoryMilestone {
  order: number;
  kind: "gym" | "elite-four" | "champion";
  name: string;
  slug: string;
  location?: string;
  specialty?: string;
  badge?: string;
  tmReward?: string;
  fieldMove?: string; // HM/field move this badge unlocks (Cut, Surf, …)
  levelCap: number; // highest level on the trainer's team
}

/** A location placed in the progression by inferring its level from the trainers
 * (or wild encounters) found there. Heuristic ordering, not canonical. */
export interface StoryLocation {
  slug: string; // display name is in the locations registry
  level: number; // median trainer level (or encounter level)
  phase: number; // number of gyms whose level cap this location's level exceeds
  via: "trainers" | "encounters";
}

/** One beat on the critical path. Battle beats — a gym/E4/champion milestone or a
 * villain/rival confrontation — plus the non-battle progression beats that fill in
 * the rest of a playthrough: obtaining an HM, catching a story legendary, picking
 * up a key item. Placed in order by `levelCap` (team level for battles, the area's
 * inferred level for progression beats — a story-order proxy; Serebii has no
 * walkthrough). Ties to a location slug so a consumer can pull the trainers/
 * encounters/items there. Heuristic ordering, not canonical. */
export interface StoryBeat {
  order: number;
  kind: StoryMilestone["kind"] | "villain" | "rival" | "hm" | "legendary" | "item";
  location: string; // slug ("" for E4/champion, which have no map location)
  levelCap: number; // ordering key: team level (battles) or the area's inferred level (progression beats)
  milestone?: string; // slug of the gym/E4/champion milestone (badge/TM/field-move live there)
  name?: string; // label for villain/rival beats, or the display name of a legendary/item beat (hm beats label with `move`)
  battles?: number; // villain/rival beats: how many battles happen at this location
  hm?: string; // "hm" beats: the machine code (e.g. "HM03")
  move?: string; // "hm" beats: the field move it teaches (e.g. "Surf")
  pokemon?: string; // "legendary" beats: the Pokémon slug
  item?: string; // "item" beats: the item slug
  method?: string; // "legendary"/"item" beats: how it's obtained (static/event, or the item's find method)
  optional?: boolean; // progression beat that's side content, not on the mandatory spine
}

export interface Story {
  milestones: StoryMilestone[];
  locations: StoryLocation[];
  criticalPath: StoryBeat[];
}

/** One evolution step, e.g. { from: "bulbasaur", to: "ivysaur", method: "Level 16" }. */
export interface EvolutionEdge {
  from: string; // slug
  to: string; // slug
  method: string; // natural-language: "Level 16", "Fire Stone", "Trade holding King's Rock", …
}

export interface PokemonRecord {
  slug: string;
  natdex: number;
  name: string;
  names: Record<string, string>; // localized: ja, fr, de, ko, ...
  types: string[];
  genderRatio: { malePct: number; femalePct: number } | "genderless";
  classification?: string;
  heightM?: number;
  weightKg?: number;
  captureRate?: number;
  baseEggSteps?: number;
  eggGroups: string[];
  abilities: string[]; // ability names; definitions live in the canonical abilities collection
  wildItems: Array<{ item: string; rate: number }>; // items held when caught wild (RSE/Emerald group); feeds items.heldBy
  baseStats: BaseStats;
  evolutionChain: string[]; // slugs of the whole family, in order
  evolutions: EvolutionEdge[]; // how each member evolves (with method)
  damageTaken: Record<string, number>; // attacking type → multiplier, non-neutral only (weak/resist/immune)
  flavorText: Partial<Record<GameSlug, string>>;
  locations: Partial<Record<GameSlug, string>>;
  learnset: Learnset; // scoped to the scraped game family (RSE for now)
  source: { url: string; scrapedAt: string };
}
