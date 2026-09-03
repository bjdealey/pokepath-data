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
  slug: string;
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

export interface Story {
  milestones: StoryMilestone[];
  locations: StoryLocation[];
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
  evolutionChain: string[]; // slugs in order, [] if none
  flavorText: Partial<Record<GameSlug, string>>;
  locations: Partial<Record<GameSlug, string>>;
  learnset: Learnset; // scoped to the scraped game family (RSE for now)
  source: { url: string; scrapedAt: string };
}
