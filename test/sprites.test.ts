// Pins the Serebii sprite/icon URL schemes (src/sprites.ts) against the committed
// fixtures — the URLs we build from a dex number / item slug / type name must
// equal the ones the real pages point at, so a scheme drift fails loudly if the
// fixtures are re-committed:
//   - Pokémon: the pokedex-rs "Picture" selector (<meta og:image> + the
//     .sprite-select data-key/ddata-key its JS turns into /pokearth/sprites/…
//     and /Shiny/…).
//   - Items: the ItemDex sprite (slug is the sprite filename).
//   - Types: the AttackDex battle-type badge (/pokedex-rs/type/<type>.gif),
//     incl. the typeless ??? ("na") and side-game "shadow".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { spritesForDex, itemSprite, typeIcon, SEREBII } from "../src/sprites.ts";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
const html = fixture("pokedex-rs-001.html");
const $ = cheerio.load(html);
const sprites = spritesForDex(1); // fixture is Bulbasaur (#001)

test("artwork matches the page's og:image", () => {
  const og = $('meta[property="og:image"]').attr("content");
  assert.equal(sprites.artwork, og);
  assert.equal(sprites.artwork, `${SEREBII}/pokemon/art/001.png`);
});

test("normal + shiny URLs match the .sprite-select keys Serebii serves", () => {
  // The page's JS builds: normal = /pokearth/sprites/<data-key>.png,
  // shiny = /Shiny/<ddata-key>.png. Map each set's key to its games.
  const setGames: Record<string, Array<keyof typeof sprites.normal>> = {
    rs: ["ruby", "sapphire"],
    em: ["emerald"],
  };
  $(".sprite-select").each((_, a) => {
    const dataKey = $(a).attr("data-key") ?? ""; // e.g. "rs/001"
    const shinyKey = $(a).attr("ddata-key") ?? ""; // e.g. "RuSa/001"
    const set = dataKey.split("/")[0]!;
    for (const game of setGames[set] ?? []) {
      assert.equal(sprites.normal[game], `${SEREBII}/pokearth/sprites/${dataKey}.png`, `${game} normal`);
      assert.equal(sprites.shiny[game], `${SEREBII}/Shiny/${shinyKey}.png`, `${game} shiny`);
    }
  });
});

test("Ruby/Sapphire share a sprite set; Emerald is distinct", () => {
  assert.equal(sprites.normal.ruby, sprites.normal.sapphire);
  assert.equal(sprites.shiny.ruby, sprites.shiny.sapphire);
  assert.notEqual(sprites.normal.emerald, sprites.normal.ruby);
  assert.notEqual(sprites.shiny.emerald, sprites.shiny.ruby);
});

test("dex number is zero-padded to 3 digits", () => {
  const s = spritesForDex(25);
  assert.equal(s.normal.emerald, `${SEREBII}/pokearth/sprites/em/025.png`);
  assert.equal(s.shiny.emerald, `${SEREBII}/Shiny/Em/025.png`);
  assert.equal(s.artwork, `${SEREBII}/pokemon/art/025.png`);
});

// --- Item icons: pinned against the ItemDex fixture -------------------------
test("item sprite matches the ItemDex page's sprite (slug = sprite filename)", () => {
  const potion = fixture("itemdex-potion.html");
  assert.equal(itemSprite("potion"), `${SEREBII}/itemdex/sprites/potion.png`);
  assert.ok(potion.includes("/itemdex/sprites/potion.png"), "fixture should carry the item sprite path we build");
});

// --- Type badges: pinned against the AttackDex fixtures ---------------------
test("type badge matches the AttackDex battle-type image (/pokedex-rs/type/…)", () => {
  // Tackle is Normal-typed; its Gen-3 battle-type badge is /pokedex-rs/type/normal.gif.
  assert.equal(typeIcon("normal"), `${SEREBII}/pokedex-rs/type/normal.gif`);
  assert.ok(fixture("attackdex-tackle.html").includes("/pokedex-rs/type/normal.gif"));
});

test("typeless ??? maps to Serebii's 'na' badge (Curse)", () => {
  assert.equal(typeIcon("???"), `${SEREBII}/pokedex-rs/type/na.gif`);
  assert.ok(fixture("attackdex-curse.html").includes("/pokedex-rs/type/na.gif"));
});

test("side-game 'shadow' uses the AttackDex badge", () => {
  assert.equal(typeIcon("shadow"), `${SEREBII}/attackdex/type/shadow.gif`);
  assert.ok(fixture("attackdex-shadowblast.html").includes("/attackdex/type/shadow.gif"));
});
