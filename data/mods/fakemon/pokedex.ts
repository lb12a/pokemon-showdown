/**
 * Fakemon species. The table itself is generated from the dex PDF
 * (`tools/fakemon/build.py`); this file exists so extra hand-written species or
 * tweaks can be layered on top without touching generated output.
 *
 * Design corrections (the Tigitz line's typings and legendary formes, the
 * Budpup line's three coats, Cottonip's hidden ability) live in
 * `SPECIES_FIXUPS` / `EXTRA_FORMES` in the generator instead, so the learnsets
 * and the tier table are built from the corrected data rather than drifting
 * away from it.
 */
import { Pokedex as GeneratedPokedex } from './generated/pokedex';

/** Hand-written overrides, applied on top of the generated dex. */
const Overrides: import('../../../sim/dex-species').ModdedSpeciesDataTable = {};

export const Pokedex: import('../../../sim/dex-species').ModdedSpeciesDataTable = {
	...GeneratedPokedex,
	...Overrides,
};
