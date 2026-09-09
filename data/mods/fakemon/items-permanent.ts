/**
 * Permanent held items (Final_Permanent_Held_Items).
 *
 * 50 items in four families: Advanced Tech & Hardware, Auxiliary Combat
 * Rigging, Mystical Seals & Relics and Geological Alloys & Elements. None of
 * them is ever consumed - they are the "always on" layer of the item pool.
 */
import { FakemonIndex } from './generated/index';
import { isCuttingMove, isKickingMove, isRollingMove, isWeightMove, extendEffect } from './item-helpers';

/** The dex PDF's signature moves, used by Voodoo Puppet-Pin. */
const SIGNATURE_MOVES = new Set<string>(Object.keys(FakemonIndex.signatureMoves));

/** Effects that count as "field damage" for Thermal Heatsink. */
const FIELD_DAMAGE = new Set([
	'sandstorm', 'hail', 'fakemonmiasma', 'fakemonants', 'fakemonelectrifiedground',
	'fakemonempfield', 'fakemonbleedhazard', 'livewire', 'gasveil', 'stealthrock', 'spikes',
]);

export const PermanentItems: import('../../../sim/dex-items').ModdedItemDataTable = {
	// ------------------------------------------- Advanced Tech & Hardware
	thermalheatsink: {
		name: "Thermal Heatsink",
		spritenum: 0,
		onDamage(damage, target, source, effect) {
			if (effect && FIELD_DAMAGE.has(effect.id)) return damage / 2;
		},
		isNonstandard: 'Custom',
		num: 3601,
		gen: 9,
		desc: "Halves damage from weather, terrain hazards and field effects.",
	},
	resonancetuningfork: {
		name: "Resonance Tuning Fork",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.flags['sound']) return this.chainModify([4506, 4096]);
		},
		onAllyBasePower(basePower, user, target, move) {
			if (move.flags['sound'] && user !== this.effectState.target) return this.chainModify([4506, 4096]);
		},
		onSourceModifyDamage(damage, source, target, move) {
			if (move.flags['sound']) return this.chainModify(0.9);
		},
		isNonstandard: 'Custom',
		num: 3602,
		gen: 9,
		desc: "Sound moves from the holder's side hit 10% harder and 10% softer at it.",
	},
	glitchedlogicboard: {
		name: "Glitched Logic-Board",
		spritenum: 0,
		onResidualOrder: 27,
		onResidual(pokemon) {
			const rooms = Object.keys(this.field.pseudoWeather).length;
			const before: number = pokemon.m.fakemonRoomCount ?? rooms;
			pokemon.m.fakemonRoomCount = rooms;
			if (rooms >= before) return;
			let lowest: StatIDExceptHP = 'atk';
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as StatIDExceptHP[]) {
				if (pokemon.storedStats[stat] < pokemon.storedStats[lowest]) lowest = stat;
			}
			this.boost({ [lowest]: 1 }, pokemon, pokemon, this.dex.items.get('glitchedlogicboard'));
		},
		isNonstandard: 'Custom',
		num: 3603,
		gen: 9,
		desc: "When a Room ends, the holder's lowest stat rises by 1 stage.",
	},
	inductioncoils: {
		name: "Induction Coils",
		spritenum: 0,
		onModifyMove(move, pokemon) {
			if (!move.flags['contact'] || move.category === 'Status') return;
			if (!this.field.isTerrain('electricterrain') || !pokemon.isGrounded()) return;
			move.secondaries = move.secondaries || [];
			move.secondaries.push({ chance: 10, volatileStatus: 'flinch' });
		},
		isNonstandard: 'Custom',
		num: 3604,
		gen: 9,
		desc: "In Electric Terrain, the holder's contact moves may cause flinching.",
	},
	heuristicanalyzer: {
		name: "Heuristic Analyzer",
		spritenum: 0,
		onSourceModifyDamage(damage, source, target, move) {
			const streak: number = target.m.fakemonHeuristicStreak || 0;
			if (target.m.fakemonHeuristicMove === move.id && streak > 0) {
				return this.chainModify([Math.max(2048, 4096 - streak * 410), 4096]);
			}
		},
		onDamagingHit(damage, target, source, move) {
			if (target.m.fakemonHeuristicMove === move.id) {
				target.m.fakemonHeuristicStreak = (target.m.fakemonHeuristicStreak || 0) + 1;
			} else {
				target.m.fakemonHeuristicMove = move.id;
				target.m.fakemonHeuristicStreak = 1;
			}
		},
		isNonstandard: 'Custom',
		num: 3605,
		gen: 9,
		desc: "Each repeat of the same incoming move deals 10% less, down to half.",
	},
	opticalprismlens: {
		name: "Optical Prism Lens",
		spritenum: 0,
		onModifyCritRatio(critRatio, user, target) {
			if (target && target.boosts.evasion > 0) return critRatio + 1;
		},
		isNonstandard: 'Custom',
		num: 3606,
		gen: 9,
		desc: "Higher critical hit ratio against targets that raised evasiveness.",
	},
	staticearthground: {
		name: "Static Earth-Ground",
		spritenum: 0,
		onDragOut(pokemon) {
			if (this.field.isTerrain('electricterrain')) {
				this.add('-activate', pokemon, 'item: Static Earth-Ground');
				return null;
			}
		},
		isNonstandard: 'Custom',
		num: 3607,
		gen: 9,
		desc: "The holder cannot be forced out while Electric Terrain is up.",
	},
	bufferoverflowchip: {
		name: "Buffer-Overflow Chip",
		spritenum: 0,
		onAfterEachBoost(boost, target, source, effect) {
			if (!source || target.isAlly(source)) return;
			if ((effect as ActiveMove)?.category && (effect as ActiveMove).category !== 'Status') return;
			let stat: BoostID;
			for (stat in boost) {
				if (boost[stat]! < 0) {
					this.boost({ spe: 1 }, target, target, this.dex.items.get('bufferoverflowchip'));
					return;
				}
			}
		},
		isNonstandard: 'Custom',
		num: 3608,
		gen: 9,
		desc: "A foe's status move lowering the holder's stats raises its Speed by 1.",
	},
	auxiliarysolarpanel: {
		name: "Auxiliary Solar-Panel",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			const secondary = user.getTypes()[1];
			if (secondary && move.type === secondary && ['sunnyday', 'desolateland'].includes(user.effectiveWeather())) {
				return this.chainModify([4506, 4096]);
			}
		},
		isNonstandard: 'Custom',
		num: 3609,
		gen: 9,
		desc: "In sunlight, moves of the holder's second type deal 10% more damage.",
	},
	subaquaticvalve: {
		name: "Sub-Aquatic Valve",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			const secondary = user.getTypes()[1];
			if (secondary && move.type === secondary && ['raindance', 'primordialsea'].includes(user.effectiveWeather())) {
				return this.chainModify([4506, 4096]);
			}
		},
		isNonstandard: 'Custom',
		num: 3610,
		gen: 9,
		desc: "In rain, moves of the holder's second type deal 10% more damage.",
	},
	kineticdynamo: {
		name: "Kinetic Dynamo",
		spritenum: 0,
		onAfterMove(source, target, move) {
			if (!isRollingMove(move) && !move.multihit) return;
			const used: number = source.m.fakemonDynamoUses || 0;
			if (used >= 3) return;
			source.m.fakemonDynamoUses = used + 1;
			this.boost({ spe: 1 }, source, source, this.dex.items.get('kineticdynamo'));
		},
		onSwitchOut(pokemon) {
			pokemon.m.fakemonDynamoUses = 0;
		},
		isNonstandard: 'Custom',
		num: 3611,
		gen: 9,
		desc: "Rolling and multi-strike moves raise Speed by 1, three times per entry.",
	},
	decouplinginterface: {
		name: "Decoupling Interface",
		spritenum: 0,
		onTakeItem(item, pokemon, source) {
			if (source && source !== pokemon) return false;
			return true;
		},
		onTryAddVolatile(status, target) {
			if (status.id === 'embargo' || status.id === 'fakemonitemlock') {
				this.add('-block', target, 'item: Decoupling Interface');
				return null;
			}
		},
		isNonstandard: 'Custom',
		num: 3612,
		gen: 9,
		desc: "The holder's item cannot be stolen, knocked off or disabled.",
	},
	encryptedtransceiver: {
		name: "Encrypted Transceiver",
		spritenum: 0,
		onAllyBasePower(basePower, user, target, move) {
			const holder = this.effectState.target as Pokemon;
			if (user === holder) return;
			if (user.getTypes().some(type => holder.hasType(type))) return this.chainModify([4301, 4096]);
		},
		isNonstandard: 'Custom',
		num: 3613,
		gen: 9,
		desc: "A partner sharing a type with the holder deals 5% more damage.",
	},

	// -------------------------------------------- Mystical Seals & Relics
	hauntedloomshard: {
		name: "Haunted Loom Shard",
		spritenum: 0,
		onModifyPriority(priority, pokemon, target, move) {
			if (move?.category !== 'Status') return;
			if (this.field.getPseudoWeather('hauntedroom') && pokemon.hp * 2 > pokemon.maxhp) {
				return priority + 1;
			}
		},
		isNonstandard: 'Custom',
		num: 3614,
		gen: 9,
		desc: "In a Haunted Room above half HP, status moves gain +1 priority.",
	},
	waxencandlestub: {
		name: "Waxen Candle-Stub",
		spritenum: 0,
		onSourceAfterFaint(length, target, source, effect) {
			if (effect?.effectType !== 'Move') return;
			extendEffect(this.field.weatherState, 1, `fakemonCandle${this.turn}`);
			for (const state of Object.values(this.field.pseudoWeather)) {
				extendEffect(state, 1, `fakemonCandle${this.turn}`);
			}
		},
		isNonstandard: 'Custom',
		num: 3615,
		gen: 9,
		desc: "A knockout by the holder extends the weather and Rooms by 1 turn.",
	},
	etherealveilweft: {
		name: "Ethereal Veil-Weft",
		spritenum: 0,
		onTrapPokemon(pokemon) {
			pokemon.trapped = false;
			pokemon.maybeTrapped = false;
		},
		onMaybeTrapPokemon(pokemon) {
			pokemon.maybeTrapped = false;
		},
		isNonstandard: 'Custom',
		num: 3616,
		gen: 9,
		desc: "The holder can always switch out, like a Ghost type.",
	},
	voodoopuppetpin: {
		name: "Voodoo Puppet-Pin",
		spritenum: 0,
		onDamagingHit(damage, target, source, move) {
			if (SIGNATURE_MOVES.has(move.id)) {
				this.damage(source.baseMaxhp / 8, source, target, this.dex.items.get('voodoopuppetpin'));
			}
		},
		isNonstandard: 'Custom',
		num: 3617,
		gen: 9,
		desc: "Signature moves that hit the holder cost their user 1/8 max HP.",
	},
	chalkinscriptionseal: {
		name: "Chalk Inscription Seal",
		spritenum: 0,
		onDamage(damage, target, source, effect) {
			if (effect && (effect.id === 'curse' || effect.id === 'fakemoncurseditem')) return false;
		},
		isNonstandard: 'Custom',
		num: 3618,
		gen: 9,
		desc: "The holder takes no damage from Curse effects.",
	},
	mirrorglassmonocle: {
		name: "Mirror-Glass Monocle",
		spritenum: 0,
		onModifyMove(move) {
			if (move.category === 'Special') move.ignoreDefensive = true;
		},
		isNonstandard: 'Custom',
		num: 3619,
		gen: 9,
		desc: "The holder's special attacks ignore the target's defensive boosts.",
	},
	fullmoonincenseburner: {
		name: "Full-Moon Incense-Burner",
		spritenum: 0,
		onSetStatus(status, target, source, effect) {
			if (!this.field.isWeather('fullmoon')) return;
			if (!['slp', 'frz'].includes(status.id)) return;
			if ((effect as Move)?.status) this.add('-immune', target, '[from] item: Full-Moon Incense-Burner');
			return false;
		},
		onTryAddVolatile(status, target) {
			if (status.id === 'yawn' && this.field.isWeather('fullmoon')) {
				this.add('-immune', target, '[from] item: Full-Moon Incense-Burner');
				return null;
			}
		},
		isNonstandard: 'Custom',
		num: 3620,
		gen: 9,
		desc: "Under Full Moon the holder cannot be put to sleep, frozen or drowsy.",
	},
	ancestraloakleaf: {
		name: "Ancestral Oak-Leaf",
		spritenum: 0,
		onSourceModifyDamage(damage, source, target, move) {
			if (move.category === 'Special' && target.volatiles['substitute']) return this.chainModify(0.85);
		},
		isNonstandard: 'Custom',
		num: 3621,
		gen: 9,
		desc: "The holder's Substitute takes 15% less damage from special attacks.",
	},
	petrifiedcocoonshell: {
		name: "Petrified Cocoon-Shell",
		spritenum: 0,
		onModifyDefPriority: 1,
		onModifyDef(def) {
			return this.chainModify([4506, 4096]);
		},
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.flags['contact']) return this.chainModify(0.95);
		},
		isNonstandard: 'Custom',
		num: 3622,
		gen: 9,
		desc: "1.1x Defense, but the holder's contact moves deal 5% less damage.",
	},
	faepowderpouch: {
		name: "Fae Powder-Pouch",
		spritenum: 0,
		onModifyMove(move) {
			if (move.type !== 'Fairy' || move.category === 'Status') return;
			move.secondaries = move.secondaries || [];
			move.secondaries.push({ chance: 10, boosts: { atk: -1 } });
		},
		isNonstandard: 'Custom',
		num: 3623,
		gen: 9,
		desc: "The holder's Fairy moves may lower the target's Attack by 1.",
	},
	twilightboundarystone: {
		name: "Twilight Boundary-Stone",
		spritenum: 0,
		onDisableMove(pokemon) {
			if (!pokemon.volatiles['taunt']) return;
			const speeds = this.getAllActive().map(mon => mon.getStat('spe', false, true));
			if (pokemon.getStat('spe', false, true) > Math.min(...speeds)) return;
			pokemon.removeVolatile('taunt');
			this.add('-activate', pokemon, 'item: Twilight Boundary-Stone');
		},
		isNonstandard: 'Custom',
		num: 3624,
		gen: 9,
		desc: "If the holder is the slowest on the field, Taunt cannot hold it.",
	},
	astralalignmentdial: {
		name: "Astral Alignment Dial",
		spritenum: 0,
		onModifyMove(move) {
			if (move.type === 'Psychic' && move.category === 'Status') {
				if (!move.ignoreImmunity) move.ignoreImmunity = {};
				if (typeof move.ignoreImmunity !== 'boolean') move.ignoreImmunity['Psychic'] = true;
			}
		},
		isNonstandard: 'Custom',
		num: 3625,
		gen: 9,
		desc: "The holder's Psychic status moves also affect Dark types.",
	},

	// ------------------------------------- Geological Alloys & Elements
	splinterbarkhusk: {
		name: "Splinter-Bark Husk",
		spritenum: 0,
		onDamagingHit(damage, target, source, move) {
			if (move.flags['contact']) {
				this.damage(Math.max(1, Math.round(damage / 10)), source, target, this.dex.items.get('splinterbarkhusk'));
			}
		},
		isNonstandard: 'Custom',
		num: 3626,
		gen: 9,
		desc: "Contact attackers take 1/10 of the damage they dealt.",
	},
	pumicefloatstone: {
		name: "Pumice Float-Stone",
		spritenum: 0,
		onModifyWeight(weighthg) {
			return weighthg / 4;
		},
		onModifySpe(spe, pokemon) {
			const foe = pokemon.foes()[0];
			if (foe && pokemon.getWeight() < foe.getWeight()) return this.chainModify([4506, 4096]);
		},
		isNonstandard: 'Custom',
		num: 3627,
		gen: 9,
		desc: "Quarters the holder's weight; +10% Speed while lighter than the foe.",
	},
	volcanicashfilter: {
		name: "Volcanic Ash-Filter",
		spritenum: 0,
		onTryBoost(boost, target, source, effect) {
			if (boost.accuracy && boost.accuracy < 0 && effect?.effectType !== 'Move') {
				delete boost.accuracy;
				this.add('-fail', target, 'unboost', 'accuracy', '[from] item: Volcanic Ash-Filter');
			}
		},
		onImmunity(type) {
			if (type === 'sandstorm') return false;
		},
		isNonstandard: 'Custom',
		num: 3628,
		gen: 9,
		desc: "Smoke, fog and sandstorm cannot lower the holder's accuracy.",
	},
	deepseacrustchitin: {
		name: "Deep-Sea Crust-Chitin",
		spritenum: 0,
		onSourceModifyDamage(damage, source, target, move) {
			if (move.flags['contact'] && move.category === 'Physical' && target.getMoveHitData(move).typeMod > 0) {
				return this.chainModify(0.88);
			}
		},
		isNonstandard: 'Custom',
		num: 3629,
		gen: 9,
		desc: "Super effective physical contact moves deal 12% less damage.",
	},
	brinycoralbranch: {
		name: "Briny Coral-Branch",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (user.hasType('Water') && move.type === 'Grass') return this.chainModify([4915, 4096]);
			if (user.hasType('Grass') && move.type === 'Water') return this.chainModify([4915, 4096]);
		},
		isNonstandard: 'Custom',
		num: 3630,
		gen: 9,
		desc: "Water types hit 15% harder with Grass moves, and the other way round.",
	},
	lodestonestabilizer: {
		name: "Lodestone Stabilizer",
		spritenum: 0,
		onTryAddVolatile(status, target) {
			if (['telekinesis', 'smackdown', 'magnetrise'].includes(status.id)) {
				this.add('-block', target, 'item: Lodestone Stabilizer');
				return null;
			}
		},
		onFoeDragOut(pokemon) {
			return null;
		},
		isNonstandard: 'Custom',
		num: 3631,
		gen: 9,
		desc: "The holder cannot be lifted, grounded or thrown around.",
	},
	searingmagmacore: {
		name: "Searing Magma-Core",
		spritenum: 0,
		onModifyMove(move, pokemon) {
			if (move.category !== 'Physical') return;
			if (!['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) return;
			move.secondaries = move.secondaries || [];
			move.secondaries.push({ chance: 10, status: 'brn' });
		},
		isNonstandard: 'Custom',
		num: 3632,
		gen: 9,
		desc: "In sunlight the holder's physical attacks may burn.",
	},
	glacialiceshard: {
		name: "Glacial Ice-Shard",
		spritenum: 0,
		onModifyMove(move, pokemon) {
			if (move.category !== 'Special') return;
			if (!['raindance', 'primordialsea', 'hail', 'snowscape'].includes(pokemon.effectiveWeather())) return;
			move.secondaries = move.secondaries || [];
			move.secondaries.push({ chance: 10, boosts: { spe: -1 } });
		},
		isNonstandard: 'Custom',
		num: 3633,
		gen: 9,
		desc: "In rain, hail or snow the holder's special attacks may lower Speed.",
	},
	bogironplating: {
		name: "Bog-Iron Plating",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.type === 'Ground' && user.hp * 2 <= user.maxhp) return this.chainModify([4506, 4096]);
		},
		isNonstandard: 'Custom',
		num: 3634,
		gen: 9,
		desc: "Below half HP the holder's Ground moves deal 10% more damage.",
	},
	quartzresonator: {
		name: "Quartz Resonator",
		spritenum: 0,
		onSwitchIn(pokemon) {
			if (this.field.terrain) {
				this.boost({ spd: 1 }, pokemon, pokemon, this.dex.items.get('quartzresonator'));
			}
		},
		isNonstandard: 'Custom',
		num: 3635,
		gen: 9,
		desc: "Raises Sp. Def by 1 stage on entry while a terrain is active.",
	},
	hardclaybedding: {
		name: "Hard-Clay Bedding",
		spritenum: 0,
		onDamage(damage, target, source, effect) {
			if (effect?.effectType === 'Status') return damage * 0.67;
		},
		isNonstandard: 'Custom',
		num: 3636,
		gen: 9,
		desc: "Poison, burn and other status damage is reduced by a third.",
	},
	heavyslateshield: {
		name: "Heavy Slate-Shield",
		spritenum: 0,
		onSourceModifyDamage(damage, source, target, move) {
			if (isCuttingMove(move) && target.getMoveHitData(move).crit) return this.chainModify(0.667);
		},
		isNonstandard: 'Custom',
		num: 3637,
		gen: 9,
		desc: "Cutting and slashing critical hits lose their extra damage.",
	},

	// --------------------------------------------- Auxiliary Combat Rigging
	spikespurredgreaves: {
		name: "Spike-Spurred Greaves",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (isKickingMove(move) || isRollingMove(move)) return this.chainModify([4587, 4096]);
		},
		isNonstandard: 'Custom',
		num: 3638,
		gen: 9,
		desc: "Kicking and rolling moves deal 12% more damage.",
	},
	springcoiledbracers: {
		name: "Spring-Coiled Bracers",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.category === 'Physical' && (move.priority || 0) < 0) return this.chainModify([4710, 4096]);
		},
		isNonstandard: 'Custom',
		num: 3639,
		gen: 9,
		desc: "Physical moves with negative priority deal 15% more damage.",
	},
	executionerscopering: {
		name: "Executioner-Scope Ring",
		spritenum: 0,
		onModifyMove(move, source, target) {
			if (target && target.hp * 10 <= target.maxhp * 3) move.accuracy = true;
		},
		isNonstandard: 'Custom',
		num: 3640,
		gen: 9,
		desc: "The holder's moves never miss targets below 30% HP.",
	},
	recoildampingharness: {
		name: "Recoil-Damping Harness",
		spritenum: 0,
		onDamage(damage, target, source, effect) {
			if (effect?.id === 'recoil' || effect?.id === 'highjumpkick' || effect?.id === 'jumpkick') {
				return damage * 0.8;
			}
		},
		isNonstandard: 'Custom',
		num: 3641,
		gen: 9,
		desc: "Recoil and crash damage the holder takes is reduced by 20%.",
	},
	targetingmonocular: {
		name: "Targeting Monocular",
		spritenum: 0,
		onModifyMove(move) {
			if (move.category === 'Status') {
				move.infiltrates = true;
				move.flags = { ...move.flags, bypasssub: 1 };
				if (move.flags['protect']) delete move.flags['protect'];
			}
		},
		isNonstandard: 'Custom',
		num: 3642,
		gen: 9,
		desc: "The holder's status moves ignore Protect and Substitute.",
	},
	reinforcedgorget: {
		name: "Reinforced Gorget",
		spritenum: 0,
		onSourceModifyDamage(damage, source, target, move) {
			const hit = move.hit || 1;
			if (hit > 1) return this.chainModify([Math.max(2048, 4096 - (hit - 1) * 614), 4096]);
		},
		isNonstandard: 'Custom',
		num: 3643,
		gen: 9,
		desc: "Each further hit of a multi-strike move deals 15% less damage.",
	},
	weightedanchorbelt: {
		name: "Weighted Anchor-Belt",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (isWeightMove(move)) return this.chainModify([4710, 4096]);
		},
		onTryBoost(boost, target, source, effect) {
			if (boost.spe && boost.spe > 0 && effect && ['Item', 'Ability'].includes(effect.effectType)) {
				delete boost.spe;
			}
		},
		isNonstandard: 'Custom',
		num: 3644,
		gen: 9,
		desc: "Weight-based moves deal 15% more; items and abilities cannot raise Speed.",
	},
	counterbalancerig: {
		name: "Counter-Balance Rig",
		spritenum: 0,
		onDamagingHit(damage, target, source, move) {
			if (target.m.fakemonCounterBalanceUsed) return;
			if (source.baseSpecies.bst <= target.baseSpecies.bst) return;
			target.m.fakemonCounterBalanceUsed = true;
			let lowest: StatIDExceptHP = 'atk';
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as StatIDExceptHP[]) {
				if (target.storedStats[stat] < target.storedStats[lowest]) lowest = stat;
			}
			this.boost({ [lowest]: 1 }, target, target, this.dex.items.get('counterbalancerig'));
		},
		onSwitchOut(pokemon) {
			pokemon.m.fakemonCounterBalanceUsed = false;
		},
		isNonstandard: 'Custom',
		num: 3645,
		gen: 9,
		desc: "Once per entry, a stronger attacker raises the holder's lowest stat.",
	},
	insulatedunderarmor: {
		name: "Insulated Under-Armor",
		spritenum: 0,
		onSourceModifyDamage(damage, source, target, move) {
			if (move.category === 'Special' && ['Fire', 'Electric'].includes(move.type)) {
				return this.chainModify(0.85);
			}
		},
		isNonstandard: 'Custom',
		num: 3646,
		gen: 9,
		desc: "Fire and Electric special attacks deal 15% less damage.",
	},
	bladedgauntletextension: {
		name: "Bladed Gauntlet-Extension",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (!isCuttingMove(move) || !target) return;
			if (target.volatiles['substitute'] || target.volatiles['protect'] || target.volatiles['brickshelter']) {
				return this.chainModify([4506, 4096]);
			}
		},
		isNonstandard: 'Custom',
		num: 3647,
		gen: 9,
		desc: "Cutting moves deal 10% more damage to shielded targets.",
	},
	quickreleasebuckle: {
		name: "Quick-Release Buckle",
		spritenum: 0,
		onSourceModifyAccuracy(accuracy, target, source, move) {
			if (typeof accuracy === 'number' && move.category === 'Status' && (move.priority || 0) > 0) {
				return this.chainModify([4710, 4096]);
			}
		},
		isNonstandard: 'Custom',
		num: 3648,
		gen: 9,
		desc: "Priority status moves are 15% more accurate.",
	},
	heavyplatedsabatons: {
		name: "Heavy-Plated Sabatons",
		spritenum: 0,
		onTryBoost(boost, target, source, effect) {
			if (!effect || !['stickyweb', 'livewire', 'fakemonelectrifiedground'].includes(effect.id)) return;
			let stat: BoostID;
			for (stat in boost) {
				if (boost[stat]! < 0) delete boost[stat];
			}
			this.add('-fail', target, 'unboost', '[from] item: Heavy-Plated Sabatons');
		},
		isNonstandard: 'Custom',
		num: 3649,
		gen: 9,
		desc: "Entry hazards cannot lower the holder's stats.",
	},
	paddedweightedvest: {
		name: "Padded Weighted-Vest",
		spritenum: 0,
		onModifyDefPriority: 1,
		onModifyDef(def) {
			return this.chainModify([4506, 4096]);
		},
		onSourceModifyDamage(damage, source, target, move) {
			if (isWeightMove(move) && target.getMoveHitData(move).typeMod > 0) {
				return this.chainModify([4710, 4096]);
			}
		},
		isNonstandard: 'Custom',
		num: 3650,
		gen: 9,
		desc: "1.1x Defense, but super effective weight-based moves hit 15% harder.",
	},
};
