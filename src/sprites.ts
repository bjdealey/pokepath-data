// Serebii's Gen-3 sprite URL scheme. Sprite URLs are a pure function of the
// national-dex number — the pokedex-rs "Picture" selector builds them from a
// game-family key plus the zero-padded dex number, so no page content is needed
// (and the scheme is pinned against the committed fixture in test/sprites.test.ts).
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
