// The Gen-3 games this scraper produces, and the per-game Serebii sources /
// selectors that differ between them. Canonical data (pokemon, moves, items,
// abilities, natures, machines, type chart) is shared across all three — only
// the game-scoped data (encounters, trainers, story, legendaries, gifts, trades,
// items, connections + derives) is produced per game, at dataset/gen3/games/<slug>/.
export type Game = "emerald" | "ruby" | "sapphire";

export interface GameConfig {
  slug: Game;
  label: string; // Serebii's "Pokémon <label>" version-header text on pokearth pages
  gymUrl: string;
  eliteUrl: string;
  tradeUrl: string;
  boxLegendary: string | null; // version-exclusive box legendary (Ruby=Groudon, Sapphire=Kyogre); Emerald has both → null
}

const S = "https://www.serebii.net";
export const GAMES: Record<Game, GameConfig> = {
  emerald: { slug: "emerald", label: "Emerald", gymUrl: `${S}/emerald/gym.shtml`, eliteUrl: `${S}/emerald/elite.shtml`, tradeUrl: `${S}/emerald/trade.shtml`, boxLegendary: null },
  ruby: { slug: "ruby", label: "Ruby", gymUrl: `${S}/rubysapphire/gyms.shtml`, eliteUrl: `${S}/rubysapphire/elitefour.shtml`, tradeUrl: `${S}/rubysapphire/trades.shtml`, boxLegendary: "groudon" },
  sapphire: { slug: "sapphire", label: "Sapphire", gymUrl: `${S}/rubysapphire/gyms.shtml`, eliteUrl: `${S}/rubysapphire/elitefour.shtml`, tradeUrl: `${S}/rubysapphire/trades.shtml`, boxLegendary: "kyogre" },
};

export const ALL_GAMES = Object.keys(GAMES) as Game[];
export const isGame = (s: string): s is Game => s in GAMES;
