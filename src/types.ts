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
