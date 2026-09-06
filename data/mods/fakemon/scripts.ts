/**
 * Fakemon - custom battle system
 * =============================
 *
 * This mod replaces Pokemon Showdown's data with the custom game defined by the
 * dex PDF, the move-expansion PDF and the custom move spreadsheet.
 *
 * Two things happen here:
 *
 * 1. `init()` enforces the hard separation between "Original Showdown Data" and
 *    "Custom Game Data". Every original species, move, ability and item is
 *    removed from this mod's data tables. A small whitelist of original moves
 *    survives *as mechanics only* (Showdown implements terrains, screens,
 *    hazards and volatiles as conditions hanging off those moves); they are all
 *    flagged `isNonstandard: 'Custom'` and appear in no learnset, so they can
 *    never be selected, imported or used by a player.
 *
 * 2. `actions` replaces Mega Evolution wholesale - see MEGA EVOLUTION below.
 */

import { FakemonIndex } from './generated/index';
import { toID } from '../../../sim/dex-data';

/**
 * Original moves kept purely because the engine and the custom data reach for
 * the *conditions* attached to them (`Field#setTerrain`, `Side#addSideCondition`,
 * `Pokemon#addVolatile` all resolve their argument through the move table).
 * None of these is obtainable: they are marked non-standard and no Fakemon
 * learns them.
 */
export const MECHANIC_MOVE_WHITELIST = [
	// the engine hard-codes this one as the no-PP fallback
	'struggle',
	// weather
	'sunnyday', 'raindance', 'sandstorm', 'hail', 'snowscape',
	// terrain
	'electricterrain', 'grassyterrain', 'mistyterrain', 'psychicterrain',
	// rooms
	'trickroom', 'magicroom', 'wonderroom', 'gravity',
	// screens & side conditions
	'reflect', 'lightscreen', 'auroraveil', 'safeguard', 'mist', 'luckychant',
	'tailwind', 'wideguard', 'quickguard', 'craftyshield', 'matblock',
	// hazards
	'spikes', 'toxicspikes', 'stealthrock', 'stickyweb',
	// protection
	'protect', 'detect', 'endure', 'spikyshield', 'banefulbunker', 'obstruct',
	'silktrap', 'burningbulwark',
	// volatiles the custom moves and abilities attach
	'substitute', 'leechseed', 'disable', 'taunt', 'encore', 'torment',
	'healblock', 'attract', 'curse', 'aquaring', 'ingrain', 'magnetrise',
	'smackdown', 'foresight', 'miracleeye', 'lockon', 'mindreader',
	'focusenergy', 'helpinghand', 'followme', 'ragepowder', 'imprison',
	'embargo', 'yawn', 'nightmare', 'powertrick', 'magiccoat', 'snatch',
	'gastroacid', 'telekinesis', 'roost', 'charge', 'destinybond', 'grudge',
	'partiallytrapped', 'bide', 'uproar', 'rollout', 'defensecurl',
] as const;

/** Sentinel returned by `canMegaEvo` for a Mega Evolution without a stone. */
export const STONELESS_MEGA = '@@FAKEMON_STONELESS_MEGA';

/** Every base stat gains this much when Mega Evolving without a Mega Stone. */
export const STONELESS_MEGA_BOOST = 20;

/**
 * Ability announcements
 * ---------------------
 * Showdown only prints an ability when the ability itself calls `-ability`, so
 * most of the custom abilities changed damage, stats, priority or the move
 * itself completely silently - the player saw a number they could not explain.
 *
 * `announceAbility` wraps every ability handler in the mod so that whenever a
 * handler actually *does* something, a line naming the Pokemon and its ability
 * is written to the battle log first. "Actually does something" means: it
 * returned a value, it logged something itself, it applied a `chainModify`, or
 * it mutated the object it was handed (the move for `onModifyMove`, the boost
 * table for `onTryBoost`, ...). A handler that runs and finds its condition
 * false stays silent.
 *
 * It announces at most once per turn per Pokemon per ability, so a modifier
 * that fires on every damage roll does not flood the log.
 */

/**
 * Bookkeeping events. They run every turn to keep the engine's idea of what is
 * legal up to date, and announcing them would print a line every upkeep for
 * something the player already sees in the UI (a greyed-out switch or move).
 */
const SILENT_ABILITY_EVENTS = new Set([
	'onTrapPokemon', 'onMaybeTrapPokemon', 'onFoeTrapPokemon', 'onFoeMaybeTrapPokemon',
	'onAllyTrapPokemon', 'onAnyTrapPokemon', 'onAnyMaybeTrapPokemon',
	'onDisableMove', 'onFoeDisableMove', 'onAllyDisableMove', 'onAnyDisableMove',
	'onUpdate', 'onAnyUpdate',
]);

/** Shallow copy used to spot a handler mutating the object it was given. */
function argSnapshot(value: unknown): AnyObject | unknown[] | null {
	if (!value || typeof value !== 'object') return null;
	if (Array.isArray(value)) return value.slice();
	// Pokemon, Side, Field and Battle are big and are not what a handler is
	// "changing" in the sense this is looking for.
	const obj = value as AnyObject;
	if (obj.getSlot || obj.sideConditions || obj.pseudoWeather || obj.sides) return null;
	const copy: AnyObject = { ...obj };
	// `secondaries` is mutated in place by several abilities, and a shallow copy
	// keeps the same array, so its length is recorded separately.
	const secondaries = (value as AnyObject).secondaries;
	if (Array.isArray(secondaries)) copy['@@secondaries'] = secondaries.length;
	return copy;
}

function argChanged(before: AnyObject | unknown[] | null, after: unknown) {
	if (!before || !after || typeof after !== 'object') return false;
	if (Array.isArray(before)) {
		if (!Array.isArray(after) || before.length !== after.length) return true;
		return before.some((value, i) => value !== (after as unknown[])[i]);
	}
	const now = argSnapshot(after) as AnyObject;
	for (const key of new Set([...Object.keys(before), ...Object.keys(now)])) {
		if (before[key] !== now[key]) return true;
	}
	return false;
}

function announceAbility(name: string, event: string, handler: (this: Battle, ...args: any[]) => any) {
	if ((handler as AnyObject).fakemonAnnounces || SILENT_ABILITY_EVENTS.has(event)) return handler;
	const wrapped = function (this: Battle, ...args: any[]) {
		const state = this.effectState;
		const holder = state?.target as Pokemon | undefined;
		const before = argSnapshot(args[0]);
		const logLength = this.log.length;
		const modifier = this.event?.modifier;

		const result = handler.apply(this, args);

		if (!holder?.isActive || state.fakemonShownTurn === this.turn) return result;
		const logged = this.log.length > logLength;
		const didSomething = result !== undefined || logged ||
			(modifier !== undefined && this.event?.modifier !== modifier) ||
			argChanged(before, args[0]);
		if (!didSomething) return result;
		// A handler that already named the ability does not need a second line.
		const own = this.log.slice(logLength).join('|');
		if (own.includes(`ability: ${name}`) || own.includes(`|-ability|`)) {
			state.fakemonShownTurn = this.turn;
			return result;
		}
		state.fakemonShownTurn = this.turn;
		// Inserted where the handler started, so it reads as the cause of what
		// the handler then logged.
		this.log.splice(logLength, 0, `|-ability|${holder.getSlot()}: ${holder.name}|${name}`);
		return result;
	};
	(wrapped as AnyObject).fakemonAnnounces = true;
	return wrapped;
}

export const Scripts: ModdedBattleScriptsData = {
	gen: 9,
	inherit: 'gen9',

	init() {
		const keepSpecies = new Set(FakemonIndex.species.map(toID));
		const keepMoves = new Set<string>([
			...FakemonIndex.genericMoves,
			...Object.keys(FakemonIndex.signatureMoves),
		]);
		const keepAbilities = new Set<string>([
			...Object.keys(FakemonIndex.abilities),
			...Object.keys(FakemonIndex.megaAbilities),
		]);
		const mechanicMoves = new Set<string>(MECHANIC_MOVE_WHITELIST);

		// --- species: nothing from the original games survives ---------------
		for (const id in this.data.Pokedex) {
			if (!keepSpecies.has(id as ID)) delete this.data.Pokedex[id];
		}
		for (const id in this.data.FormatsData) {
			if (!keepSpecies.has(id as ID)) delete this.data.FormatsData[id];
		}
		for (const id in this.data.Learnsets) {
			if (!keepSpecies.has(id as ID)) delete this.data.Learnsets[id];
		}
		for (const id in this.data.PokemonGoData) delete this.data.PokemonGoData[id];

		// --- moves: custom moves, plus mechanic providers nobody can select ---
		for (const id in this.data.Moves) {
			// The index lists the selectable moves; internal helpers this mod
			// defines (Needle Jab's counter, Barbed Counter's hit) are tagged
			// Custom instead, and deleting them would silently break their move.
			if (keepMoves.has(id) || this.data.Moves[id].isNonstandard === 'Custom') continue;
			if (mechanicMoves.has(id)) {
				const move = this.modData('Moves', id);
				move.isNonstandard = 'Custom';
				continue;
			}
			delete this.data.Moves[id];
		}

		// --- abilities: custom only. `noability` is the engine's empty slot ---
		for (const id in this.data.Abilities) {
			if (id === 'noability') continue;
			if (!keepAbilities.has(id)) delete this.data.Abilities[id];
		}
		// Every remaining ability announces itself when it takes effect.
		for (const id in this.data.Abilities) {
			if (id === 'noability') continue;
			const ability = this.data.Abilities[id] as AnyObject;
			for (const key of Object.keys(ability)) {
				if (!key.startsWith('on') || typeof ability[key] !== 'function') continue;
				ability[key] = announceAbility(ability.name, key, ability[key]);
			}
		}

		// --- items: custom only ----------------------------------------------
		const keepItems = new Set(Object.keys(this.data.Items).filter(
			id => this.data.Items[id].isNonstandard === 'Custom'));
		for (const id in this.data.Items) {
			if (!keepItems.has(id)) delete this.data.Items[id];
		}

		// --- aliases -------------------------------------------------------
		// Lookups resolve aliases *before* the data tables, so an inherited
		// alias such as "adapt" -> "adaptability" would hide the custom move
		// with that exact ID. Keep only aliases that still point at something
		// this mod has, and never one that shadows a custom entry.
		const has = (id: string) => !!(this.data.Pokedex[id] || this.data.Moves[id] ||
			this.data.Abilities[id] || this.data.Items[id]);
		const aliases = new Map<ID, ID>();
		for (const [alias, target] of this.loadAliases()) {
			if (has(alias) || !has(target)) continue;
			aliases.set(alias, target);
		}
		(this as any).aliases = aliases;
	},

	actions: {
		inherit: true,

		// #region MEGA EVOLUTION
		// ====================================================================
		// Fakemon rules (spec sections 9-12):
		//   * every Pokemon can Mega Evolve, once per battle, stone or not;
		//   * without a matching stone it stays the same species and simply
		//     gains +20 to all six base stats (+120 BST) and keeps its ability;
		//   * with its own Mega Stone it becomes the -Mega forme, which is
		//     worth exactly +100 BST and swaps in the Mega Ability.
		// ====================================================================

		canMegaEvo(pokemon) {
			// A forme that is already Mega cannot Mega again.
			if (pokemon.species.isMega || pokemon.volatiles['fakemonmega']) return null;
			const item = pokemon.getItem();
			if (item.megaStone) {
				const forme = item.megaStone[pokemon.baseSpecies.name] ||
					item.megaStone[pokemon.baseSpecies.baseSpecies];
				// A stone that does not belong to this Pokemon simply does
				// nothing; the Pokemon can still take the stoneless route.
				if (forme && forme !== pokemon.species.name) return forme;
			}
			return STONELESS_MEGA;
		},

		runMegaEvo(pokemon) {
			const speciesid = pokemon.canMegaEvo || pokemon.canUltraBurst;
			if (!speciesid) return false;

			if (speciesid === STONELESS_MEGA) {
				// Mega Evolution without a Mega Stone. The Pokemon deliberately
				// stays the same species (spec: "Die Mega-Form soll dabei
				// weiterhin das urspruengliche Pokemon bleiben"), so instead of a
				// forme change we install a cloned species whose six base stats
				// are each 20 higher.
				const base = pokemon.baseSpecies;
				const megaSpecies = this.dex.deepClone(base);
				for (const stat of Object.keys(megaSpecies.baseStats) as (keyof StatsTable)[]) {
					megaSpecies.baseStats[stat] = Math.min(
						255, megaSpecies.baseStats[stat] + STONELESS_MEGA_BOOST);
				}
				const stats: number[] = Object.values(megaSpecies.baseStats);
				megaSpecies.bst = stats.reduce((total, value) => total + value, 0);

				pokemon.baseSpecies = megaSpecies;
				pokemon.setSpecies(megaSpecies, null);
				pokemon.updateMaxHp();
				// A marker the UI, the AI and `canMegaEvo` can all read.
				pokemon.addVolatile('fakemonmega');
				pokemon.moveThisTurnResult = true;

				this.battle.add('-mega', pokemon, base.name, 'Mega Evolution');
				this.battle.add('-message',
					`${pokemon.name} Mega Evolved without a Mega Stone! (+20 to every base stat)`);
			} else {
				// Power Grid keeps the ability the Pokemon had before Mega Evolving.
				pokemon.m.preMegaAbility = pokemon.ability;
				pokemon.formeChange(speciesid, pokemon.getItem(), true);
			}

			// Still only one Mega Evolution per side per battle.
			for (const ally of pokemon.side.pokemon) {
				ally.canMegaEvo = false;
				ally.canUltraBurst = null;
			}

			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},

		// #endregion
	},
};
