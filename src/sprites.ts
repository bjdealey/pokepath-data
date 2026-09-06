// Serebii's Gen-3 sprite/icon URL schemes — all pure functions of data the
// dataset already holds (a national-dex number, an item slug, a type name), so
// no page content is needed and no network is used. Each scheme is pinned
// against a committed fixture in test/sprites.test.ts.
//
// Pokémon battle sprites: the pokedex-rs "Picture" selector builds them from a
// game-family key plus the zero-padded dex number.
//
// Battle sprites are per game-family: Ruby/Sapphire share the "rs" set, Emerald
// has "em" (FireRed/LeafGreen's "frlg" is also Gen-3 but not a game this dataset
// produces). Normal sprites live at /pokearth/sprites/<set>/<natdex>.png; shiny
// at /Shiny/<Set>/<natdex>.png (Serebii uses different casing in the shiny path —
// "RuSa"/"Em" — so the shiny key is tracked separately). Official artwork is
// game-agnostic at /pokemon/art/<natdex>.png.
//
// URLs link to Serebii; images are NOT re-hosted here (Serebii ToS).
import type { GameSlug, PokemonSprites } from "./types.ts";

export const SEREBII = "https://www.serebii.net";
const pad = (natdex: number) => String(natdex).padStart(3, "0");

interface SpriteSet {
  games: GameSlug[]; // games served by this sprite family (share one URL)
  normal: string; // /pokearth/sprites/<normal>/… path segment
  shiny: string; // /Shiny/<shiny>/… path segment (different casing on Serebii)
}
const SETS: SpriteSet[] = [
  { games: ["ruby", "sapphire"], normal: "rs", shiny: "RuSa" },
  { games: ["emerald"], normal: "em", shiny: "Em" },
];

/** Build the Serebii sprite/artwork URLs for a national-dex number (no network —
 * the scheme is deterministic). Normal + shiny battle sprites per game, plus the
 * game-agnostic official artwork. */
export function spritesForDex(natdex: number): PokemonSprites {
  const n = pad(natdex);
  const normal: PokemonSprites["normal"] = {};
  const shiny: PokemonSprites["shiny"] = {};
  for (const set of SETS) {
    for (const game of set.games) {
      normal[game] = `${SEREBII}/pokearth/sprites/${set.normal}/${n}.png`;
      shiny[game] = `${SEREBII}/Shiny/${set.shiny}/${n}.png`;
    }
  }
  return { normal, shiny, artwork: `${SEREBII}/pokemon/art/${n}.png` };
}

/** Serebii item icon (ItemDex sprite). Our item slug is the ItemDex-link basename
 * (`source.url` = /itemdex/<slug>.shtml), which is also the sprite filename —
 * e.g. "oranberry" → /itemdex/sprites/oranberry.png. Pure function of the slug. */
export function itemSprite(slug: string): string {
  return `${SEREBII}/itemdex/sprites/${slug}.png`;
}

// The Gen-3 battle-type badges live at /pokedex-rs/type/<type>.gif for the 17
// standard types. Two dataset types aren't standard Gen-3 battle types and need
// their own badge: the typeless "???" (Curse) is Serebii's "na", and the
// side-game "shadow" type (Colosseum/XD moves) only has an AttackDex badge.
const TYPE_ICON_PATH: Record<string, string> = {
  "???": "pokedex-rs/type/na.gif",
  shadow: "attackdex/type/shadow.gif",
};

/** Serebii Gen-3 type badge URL for a type name (no network). */
export function typeIcon(type: string): string {
  const override = TYPE_ICON_PATH[type];
  return override ? `${SEREBII}/${override}` : `${SEREBII}/pokedex-rs/type/${type}.gif`;
}
