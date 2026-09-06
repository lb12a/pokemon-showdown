/**
 * Fakemon moves.
 *
 * `generated/moves-generic.ts` holds the 717 moves compiled from the move
 * expansion PDF and the custom move spreadsheet. `moves-signature.ts` holds the
 * hand-implemented signature moves from the dex PDF (the yellow entries).
 * `moves-effects.ts` fills the gaps: a setter for every status, weather,
 * terrain, room and side condition that only an unobtainable original move
 * could reach, plus the protecting move every Pokemon learns.
 */
import { GenericMoves } from './generated/moves-generic';
import { SignatureMoves } from './moves-signature';
import { EffectMoves } from './moves-effects';

export const Moves: import('../../../sim/dex-moves').ModdedMoveDataTable = {
	...GenericMoves,
	...SignatureMoves,
	...EffectMoves,
};
