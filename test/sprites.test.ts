// Pins the Serebii sprite URL scheme (src/sprites.ts) against the committed
// pokedex-rs fixture: the URLs we build from a national-dex number must equal
// the ones Serebii's own "Picture" selector points at (the <meta og:image>
// artwork + the .sprite-select data-key/ddata-key the page's JS turns into
// /pokearth/sprites/<key>.png and /Shiny/<key>.png). If Serebii ever changes the
// scheme and someone re-commits the fixture, this fails loudly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { spritesForDex, SEREBII } from "../src/sprites.ts";

const html = readFileSync(fileURLToPath(new URL("./fixtures/pokedex-rs-001.html", import.meta.url)), "utf8");
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
