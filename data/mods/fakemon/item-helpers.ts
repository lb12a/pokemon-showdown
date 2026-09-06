/**
 * Shared helpers for the custom item tables.
 *
 * The item spreadsheets describe effects in prose ("rolling moves", "cutting
 * moves", "weight-based moves", "extends the duration by 2 turns"...). The
 * helpers below are the single place where those phrases are turned into
 * something the engine can check, so every item that mentions the same concept
 * behaves identically.
 */
import { FakemonIndex } from './generated/index';

/** Moves whose damage scales with weight (generated from the move text). */
export const WEIGHT_MOVES = new Set<string>(FakemonIndex.weightMoves);

const ROLLING = /roll|spin|twirl|somersault|whirl|cyclone|tumble|wheel|rotor|gyro|topple|drill/;
const CUTTING = /slash|cut|blade|sever|scythe|razor|shear|saw|slice|claw|fang|edge|carve|guillotine/;
const KICKING = /kick|stomp|trample|punt|heel|hoof|stamp/;
const PULSE = /pulse|wave|beam|signal|sonar|ping|packet|stream|data|byte|code|glitch|static|surge|volt|circuit|laser/;

/** "rolling / spinning / rotation moves" from the item texts. */
export function isRollingMove(move: { id: string }) {
	return ROLLING.test(move.id);
}

/** "cutting, slashing and severing moves" from the item texts. */
export function isCuttingMove(move: { id: string }) {
	return CUTTING.test(move.id);
}

/** "kicking moves" from the item texts. */
export function isKickingMove(move: { id: string }) {
	return KICKING.test(move.id);
}

/** "electronic, digital or pulse moves" from the item texts. */
export function isPulseMove(move: { id: string, flags?: AnyObject }) {
	return !!move.flags?.pulse || PULSE.test(move.id);
}

/** "weight-based moves" - the generated list plus anything with a weight ratio. */
export function isWeightMove(move: { id: string }) {
	return WEIGHT_MOVES.has(move.id);
}

/**
 * Adds turns to a running weather/terrain/room/side condition exactly once per
 * instance of that condition. `tag` is the marker written onto the effect state
 * so the same item cannot keep an effect alive forever.
 */
export function extendEffect(state: AnyObject | null | undefined, turns: number, tag: string) {
	if (!state || typeof state.duration !== 'number') return false;
	if (state[tag]) return false;
	state[tag] = true;
	state.duration += turns;
	return true;
}

/** True if the Pokemon currently has at least one lowered stat stage. */
export function hasStatDrop(pokemon: Pokemon) {
	let stat: BoostID;
	for (stat in pokemon.boosts) {
		if (pokemon.boosts[stat] < 0) return true;
	}
	return false;
}
