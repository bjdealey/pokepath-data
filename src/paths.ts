// Dataset layout. The canonical entities (pokemon/moves/items/machines/typechart)
// are generation-scoped — a Pokémon's learnset, a move's power/category, and the
// type chart all differ per generation — so they live under dataset/<GEN>/, with
// each game nested beneath its generation. Adding a generation later is a new
// subtree (dataset/gen4/…), not a schema change.
//
// Serebii's sources are themselves per-generation (pokedex-rs / attackdex / pokearth
// are all Gen 3), so this scraper targets one generation, named here. A future
// generation gets its own source URLs and would set GEN accordingly.
import { fileURLToPath } from "node:url";

export const GEN = "gen3";
export const DATASET_ROOT = fileURLToPath(new URL("../dataset/", import.meta.url));
export const GEN_DIR = `${DATASET_ROOT}${GEN}/`;
