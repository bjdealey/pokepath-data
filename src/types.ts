// Dataset record shapes — the contract every consumer (pokepath, pokefolio,
// pokeroute, ...) reads. Canonical entities are game-agnostic; game-scoped
// facts (locations, flavor, learnset) are keyed by game slug.

export type GameSlug =
  | "ruby" | "sapphire" | "emerald" | "firered" | "leafgreen"
  | "colosseum" | "xd";

export interface Ability {
  name: string;
  description?: string;
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
  move: string;
  moveSlug: string | null;
  type: string | null;
  category: string | null;
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
  location: string; // slug
  locationName: string;
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
  source: { url: string; scrapedAt: string };
}

/** A Pokémon obtained outside wild grass — the starter (Prof Birch's choice of
 * three) or a one-off gift/egg — from a pokearth page's "Gift - Emerald" table. */
export interface Gift {
  pokemon: string; // slug
  natdex: number;
  method: "starter" | "gift"; // starter = the choosable trio; gift = a one-off handout/egg
  level: number | null;
  location: string; // slug
  locationName: string;
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
  slug: string;
  name: string;
  level: number; // median trainer level (or encounter level)
  phase: number; // number of gyms whose level cap this location's level exceeds
  via: "trainers" | "encounters";
}

/** One beat on the mandatory critical path — a gym/E4/champion milestone or a
 * villain/rival confrontation — placed in order by team level (a story-order
 * proxy; Serebii has no walkthrough). Ties to a location slug so a consumer can
 * pull the trainers/encounters/items there. Heuristic ordering, not canonical. */
export interface StoryBeat {
  order: number;
  kind: StoryMilestone["kind"] | "villain" | "rival";
  name: string;
  location: string; // slug ("" for E4/champion, which have no map location)
  locationName: string;
  levelCap: number;
  badge?: string;
  tmReward?: string;
  fieldMove?: string;
  battles?: number; // villain/rival beats: how many battles happen at this location
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
  abilities: Ability[];
  baseStats: BaseStats;
  evolutionChain: string[]; // slugs of the whole family, in order
  evolutions: EvolutionEdge[]; // how each member evolves (with method)
  damageTaken: Record<string, number>; // attacking type → multiplier, non-neutral only (weak/resist/immune)
  flavorText: Partial<Record<GameSlug, string>>;
  locations: Partial<Record<GameSlug, string>>;
  learnset: Learnset; // scoped to the scraped game family (RSE for now)
  source: { url: string; scrapedAt: string };
}
