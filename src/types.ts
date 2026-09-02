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
}

export interface TrainerPokemon {
  pokemon: string; // slug
  natdex: number;
  level: number;
  moves: string[];
  heldItem: string | null;
}

export interface Trainer {
  slug: string;
  name: string;
  class: "Gym Leader" | "Elite Four" | "Champion";
  location?: string;
  specialty?: string; // type name
  badge?: string;
  team: TrainerPokemon[];
}

/** A rival or villain (Team Magma/Aqua) battle scraped from a pokearth page. */
export interface Battle {
  label: string; // full trainer label, e.g. "Pokémon Trainer Brendan"
  kind: "rival" | "villain";
  location: string; // location slug
  locationName: string;
  variant?: string; // rival starter condition, e.g. "Mudkip Chosen"
  team: Array<{ pokemon: string; natdex: number; level: number }>;
}

/** One node in the game's progression spine (gyms → Elite Four → Champion). */
export interface StoryStep {
  order: number;
  kind: "gym" | "elite-four" | "champion";
  name: string; // leader / member / champion
  slug: string;
  city?: string;
  location?: string;
  specialty?: string;
  badge?: string;
  tmReward?: string;
  fieldMove?: string; // HM/field move this badge unlocks (Cut, Surf, …)
  levelCap: number; // highest level on the trainer's team
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
