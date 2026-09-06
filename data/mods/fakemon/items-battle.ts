/**
 * Battle items (Non_Food_Battle_Items).
 *
 * 50 held items in four families: Held Tech & Modules, Tactical Gear &
 * Armaments, Mystic Relics & Charms and Natural Elements & Ores. Unlike the
 * food and consumable tables these are gear: most of them stay on the holder
 * for the whole battle.
 */
import { isCuttingMove, isPulseMove, isWeightMove, extendEffect } from './item-helpers';

/** Room condition -> the type Glitch-Drive tunes the holder to. */
const ROOM_TYPES: { [id: string]: string } = {
	hauntedroom: 'Ghost',
	glitchedroom: 'Electric',
	trickroom: 'Psychic',
	magicroom: 'Fairy',
	wonderroom: 'Psychic',
};

export const BattleItems: import('../../../sim/dex-items').ModdedItemDataTable = {
	// ------------------------------------------------- Held Tech & Modules
	glitchdrive: {
		name: "Glitch-Drive",
		spritenum: 0,
		onSwitchIn(pokemon) {
			for (const id of Object.keys(this.field.pseudoWeather)) {
				const type = ROOM_TYPES[id];
				if (!type || pokemon.hasType(type)) continue;
				if (pokemon.setType([pokemon.getTypes()[0], type])) {
					this.add('-start', pokemon, 'typechange', pokemon.getTypes().join('/'), '[from] item: Glitch-Drive');
				}
				return;
			}
		},
		isNonstandard: 'Custom',
		num: 3501,
		gen: 9,
		desc: "On entry the holder's second type matches the active Room.",
	},
	ddosamplifier: {
		name: "DDOS-Amplifier",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (!move.multihit) return;
			const hit = move.hit || 1;
			return this.chainModify([4096 + Math.min(hit, 5) * 410, 4096]);
		},
		onAfterMove(source, target, move) {
			if (move.multihit && (move.hit || 0) >= 5 && target) {
				this.boost({ spd: -1 }, target, source, this.dex.items.get('ddosamplifier'));
			}
		},
		isNonstandard: 'Custom',
		num: 3502,
		gen: 9,
		desc: "Multi-strike moves gain 10% power per hit; 5 hits also drop Sp. Def.",
	},
	staticcapacitor: {
		name: "Static Capacitor",
		spritenum: 0,
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Electric') {
				if (!this.boost({ spe: 1 }, target, target, this.dex.items.get('staticcapacitor'))) {
					this.add('-immune', target, '[from] item: Static Capacitor');
				}
				return null;
			}
		},
		isNonstandard: 'Custom',
		num: 3503,
		gen: 9,
		desc: "Absorbs Electric moves and raises the holder's Speed by 1 instead.",
	},
	malwareshieldpatch: {
		name: "Malware-Shield Patch",
		spritenum: 0,
		onSetAbility(ability, target, source) {
			if (source && source !== target) {
				this.add('-block', target, 'item: Malware-Shield Patch');
				return null;
			}
		},
		onTryAddVolatile(status, target) {
			if (status.id === 'gastroacid' || status.id === 'fakemonitemabilitylock') {
				this.add('-block', target, 'item: Malware-Shield Patch');
				return null;
			}
		},
		isNonstandard: 'Custom',
		num: 3504,
		gen: 9,
		desc: "The holder's Ability cannot be suppressed, changed or replaced.",
	},
	surgesuppressor: {
		name: "Surge Suppressor",
		spritenum: 0,
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Electric' && target.status === 'par' && target.useItem()) {
				target.cureStatus();
			}
		},
		isNonstandard: 'Custom',
		num: 3505,
		gen: 9,
		desc: "An Electric hit while paralysed cures the paralysis. Single use.",
	},
	antennalinkcable: {
		name: "Antenna Link-Cable",
		spritenum: 0,
		onAnyModifyAccuracy(accuracy, target, source, move) {
			if (typeof accuracy !== 'number') return;
			const holder = this.effectState.target as Pokemon;
			if (source !== holder && !source.isAlly(holder)) return;
			if (move.flags['sound'] || isPulseMove(move)) return this.chainModify(1.2);
		},
		isNonstandard: 'Custom',
		num: 3506,
		gen: 9,
		desc: "Sound and pulse moves from the holder and its ally are 20% more accurate.",
	},
	overclockbattery: {
		name: "Overclock Battery",
		spritenum: 0,
		onUpdate(pokemon) {
			if (pokemon.hp * 4 <= pokemon.maxhp && !pokemon.m.fakemonOverclocked) {
				pokemon.m.fakemonOverclocked = true;
				this.boost({ spa: 2 }, pokemon, pokemon, this.dex.items.get('overclockbattery'));
			}
		},
		onResidualOrder: 6,
		onResidual(pokemon) {
			if (pokemon.m.fakemonOverclocked) {
				this.damage(pokemon.baseMaxhp / 10, pokemon, pokemon, this.dex.items.get('overclockbattery'));
			}
		},
		isNonstandard: 'Custom',
		num: 3507,
		gen: 9,
		desc: "Below 25% HP: +2 Sp. Atk, then 10% max HP recoil every turn.",
	},
	encryptionkey: {
		name: "Encryption Key",
		spritenum: 0,
		onSwitchIn(pokemon) {
			if (!this.effectState.used) pokemon.addVolatile('fakemonhazardward', pokemon, this.dex.items.get('encryptionkey'));
		},
		onAfterSwitchInSelf() {
			this.effectState.used = true;
		},
		isNonstandard: 'Custom',
		num: 3508,
		gen: 9,
		desc: "Blocks entry hazard side effects on the first switch-in.",
	},
	codebreakerdongle: {
		name: "Code-Breaker Dongle",
		spritenum: 0,
		onModifyMove(move) {
			move.infiltrates = true;
		},
		isNonstandard: 'Custom',
		num: 3509,
		gen: 9,
		desc: "The holder's moves ignore Reflect, Light Screen and other screens.",
	},
	datalogchip: {
		name: "Data-Log Chip",
		spritenum: 0,
		onSwitchIn(pokemon) {
			for (const foe of pokemon.foes()) {
				if (foe.item) this.add('-item', foe, foe.getItem().name, '[from] item: Data-Log Chip', '[identify]');
			}
		},
		isNonstandard: 'Custom',
		num: 3510,
		gen: 9,
		desc: "Reveals every opposing held item when the holder switches in.",
	},
	proxyroutercore: {
		name: "Proxy-Router Core",
		spritenum: 0,
		onTryHit(target, source, move) {
			if (target === source || move.hasBounced || !move.flags['reflectable']) return;
			if (this.effectState.used) return;
			const foes = target.foes();
			if (!foes.length) return;
			this.effectState.used = true;
			const newMove = this.dex.getActiveMove(move.id);
			newMove.hasBounced = true;
			newMove.pranksterBoosted = false;
			this.add('-activate', target, 'item: Proxy-Router Core');
			this.actions.useMove(newMove, target, { target: this.sample(foes) });
			return null;
		},
		isNonstandard: 'Custom',
		num: 3511,
		gen: 9,
		desc: "Once, bounces a status move aimed at the holder to a random foe.",
	},
	feedbacklooper: {
		name: "Feedback Looper",
		spritenum: 0,
		onFlinch(pokemon) {
			const attacker = pokemon.volatiles['flinch']?.source as Pokemon | undefined;
			if (attacker && pokemon.useItem()) {
				this.boost({ spe: -2 }, attacker, pokemon, this.dex.items.get('feedbacklooper'));
			}
		},
		isNonstandard: 'Custom',
		num: 3512,
		gen: 9,
		desc: "If the holder flinches, the attacker loses 2 stages of Speed. Single use.",
	},
	quantumcore: {
		name: "Quantum Core",
		spritenum: 0,
		onFractionalPriorityPriority: -1,
		onFractionalPriority(priority, pokemon) {
			if (Object.keys(this.field.pseudoWeather).some(id => ROOM_TYPES[id])) return 0.1;
		},
		isNonstandard: 'Custom',
		num: 3513,
		gen: 9,
		desc: "While a Room is active the holder moves first in its priority bracket.",
	},
	signalbooster: {
		name: "Signal Booster",
		spritenum: 0,
		onModifyPriority(priority, pokemon, target, move) {
			if (move && isPulseMove(move) && pokemon.activeTurns <= 1) return priority + 1;
		},
		isNonstandard: 'Custom',
		num: 3514,
		gen: 9,
		desc: "Digital and pulse moves gain +1 priority on the holder's first turn.",
	},
	empgrenade: {
		name: "EMP Grenade",
		spritenum: 0,
		onFaint(target, source, effect) {
			if (effect?.effectType === 'Move' && source && source !== target) {
				source.addVolatile('fakemonitemlock', target, this.dex.items.get('empgrenade'));
			}
		},
		isNonstandard: 'Custom',
		num: 3515,
		gen: 9,
		desc: "If the holder faints to an attack, that attacker's item stops working.",
	},

	// ---------------------------------------------- Mystic Relics & Charms
	polishedshardmirror: {
		name: "Polished Shard-Mirror",
		spritenum: 0,
		onDamagingHit(damage, target, source, move) {
			if (move.category !== 'Special') return;
			const screens = ['reflect', 'lightscreen', 'auroraveil'];
			if (!screens.some(id => target.side.getSideCondition(id))) return;
			this.damage(Math.max(1, Math.round(damage * 0.15)), source, target, this.dex.items.get('polishedshardmirror'));
		},
		isNonstandard: 'Custom',
		num: 3516,
		gen: 9,
		desc: "Behind a screen, 15% of special damage is reflected at the attacker.",
	},
	haunteddolleye: {
		name: "Haunted Doll-Eye",
		spritenum: 0,
		// A Haunted Room started while the holder is out already gets the longer
		// duration from hauntedroom.durationCallback; this covers switching in later.
		onSwitchIn() {
			extendEffect(this.field.pseudoWeather['hauntedroom'], 2, 'fakemonDollEye');
		},
		isNonstandard: 'Custom',
		num: 3517,
		gen: 9,
		desc: "Haunted Room lasts 2 turns longer while the holder is around.",
	},
	marionettestring: {
		name: "Marionette String",
		spritenum: 0,
		onSourceModifyAccuracy(accuracy, target, source, move) {
			if (typeof accuracy === 'number' && move.type === 'Psychic') return this.chainModify([4915, 4096]);
		},
		onModifyMove(move) {
			if (move.type === 'Psychic') move.ignoreEvasion = true;
		},
		isNonstandard: 'Custom',
		num: 3518,
		gen: 9,
		desc: "Psychic moves are 15% more accurate and ignore evasion boosts.",
	},
	psychiccatalyst: {
		name: "Psychic Catalyst",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower() {
			if (this.field.terrain) return this.chainModify(1.2);
		},
		isNonstandard: 'Custom',
		num: 3519,
		gen: 9,
		desc: "The holder's moves deal 20% more damage while a terrain is active.",
	},
	soullinkribbon: {
		name: "Soul-Link Ribbon",
		spritenum: 0,
		onAllyFaint(target) {
			const holder = this.effectState.target as Pokemon;
			if (target !== holder) {
				this.boost({ spa: 1 }, holder, holder, this.dex.items.get('soullinkribbon'));
			}
		},
		isNonstandard: 'Custom',
		num: 3520,
		gen: 9,
		desc: "Raises Sp. Atk by 1 stage when the holder's partner is knocked out.",
	},
	hexingincense: {
		name: "Hexing Incense",
		spritenum: 0,
		onModifyMove(move) {
			if (!move.secondaries) return;
			for (const secondary of move.secondaries) {
				if (secondary.chance && (secondary.status || secondary.volatileStatus)) {
					secondary.chance = Math.min(100, secondary.chance + 10);
				}
			}
		},
		isNonstandard: 'Custom',
		num: 3521,
		gen: 9,
		desc: "Status-inflicting secondary effects are 10 percentage points likelier.",
	},
	fullmoonpendant: {
		name: "Full Moon Pendant",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (this.field.isWeather('fullmoon') && ['Ghost', 'Fairy'].includes(move.type)) {
				return this.chainModify([4915, 4096]);
			}
		},
		isNonstandard: 'Custom',
		num: 3522,
		gen: 9,
		desc: "Under Full Moon, Ghost and Fairy moves deal 15% more damage.",
	},
	cursedhandkerchief: {
		name: "Cursed Handkerchief",
		spritenum: 0,
		onDamagingHit(damage, target, source, move) {
			if (move.flags['contact'] && this.randomChance(3, 10)) {
				source.addVolatile('curse', target, this.dex.items.get('cursedhandkerchief'));
			}
		},
		isNonstandard: 'Custom',
		num: 3523,
		gen: 9,
		desc: "Contact attackers have a 30% chance to be Cursed.",
	},
	kaleidocharm: {
		name: "Kaleido-Charm",
		spritenum: 0,
		onDamagingHit(damage, target, source, move) {
			if (this.effectState.used || !move.type || target.hasType(move.type)) return;
			this.effectState.used = true;
			if (target.setType([move.type, ...target.getTypes().slice(1)])) {
				this.add('-start', target, 'typechange', target.getTypes().join('/'), '[from] item: Kaleido-Charm');
			}
		},
		isNonstandard: 'Custom',
		num: 3524,
		gen: 9,
		desc: "Once, the holder's primary type becomes the type of the move that hit it.",
	},
	twilighthourglass: {
		name: "Twilight Hourglass",
		spritenum: 0,
		onWeatherChange() {
			extendEffect(this.field.weatherState, 1, 'fakemonHourglass');
		},
		onTerrainChange() {
			extendEffect(this.field.terrainState, 1, 'fakemonHourglass');
		},
		onSwitchIn() {
			for (const state of Object.values(this.field.pseudoWeather)) {
				extendEffect(state, 1, 'fakemonHourglass');
			}
		},
		isNonstandard: 'Custom',
		num: 3525,
		gen: 9,
		desc: "Weather, terrain and Rooms last 1 turn longer while the holder is out.",
	},

	// ------------------------------------------- Natural Elements & Ores
	magnetitecore: {
		name: "Magnetite Core",
		spritenum: 0,
		onModifyWeight(weighthg) {
			return weighthg * 2;
		},
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Electric') {
				this.boost({ def: 1 }, target, target, this.dex.items.get('magnetitecore'));
			}
		},
		isNonstandard: 'Custom',
		num: 3526,
		gen: 9,
		desc: "Doubles weight; Electric hits raise the holder's Defense by 1.",
	},
	splinteredbark: {
		name: "Splintered Bark",
		spritenum: 0,
		onDamagingHit(damage, target, source, move) {
			if (!move.flags['contact'] || this.effectState.used) return;
			this.effectState.used = true;
			target.side.foe.addSideCondition('stealthrock', target, this.dex.items.get('splinteredbark'));
		},
		isNonstandard: 'Custom',
		num: 3527,
		gen: 9,
		desc: "Once, a contact hit scatters Stealth Rock on the opposing side.",
	},
	volcanicsulfurore: {
		name: "Volcanic Sulfur Ore",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.type === 'Fire') return this.chainModify([4915, 4096]);
		},
		onSetStatus(status, target, source, effect) {
			if (status.id !== 'brn') return;
			if ((effect as Move)?.status) this.add('-immune', target, '[from] item: Volcanic Sulfur Ore');
			return false;
		},
		isNonstandard: 'Custom',
		num: 3528,
		gen: 9,
		desc: "Fire moves deal 15% more damage; the holder cannot be burned.",
	},
	bogmudclump: {
		name: "Bog-Mud Clump",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.type === 'Ground' && ['raindance', 'primordialsea'].includes(user.effectiveWeather())) {
				return this.chainModify([4915, 4096]);
			}
		},
		isNonstandard: 'Custom',
		num: 3529,
		gen: 9,
		desc: "Ground moves deal 15% more damage in rain.",
	},
	deepseafossil: {
		name: "Deep-Sea Fossil",
		spritenum: 0,
		onSourceModifyDamage(damage, source, target, move) {
			if (target.hp === target.maxhp && ['Rock', 'Steel'].includes(move.type) &&
				target.getMoveHitData(move).typeMod > 0) {
				return this.chainModify(0.75);
			}
		},
		isNonstandard: 'Custom',
		num: 3530,
		gen: 9,
		desc: "At full HP, super effective Rock and Steel moves deal 25% less.",
	},
	ambercrystalresin: {
		name: "Amber Crystal Resin",
		spritenum: 0,
		onCriticalHit() {
			return false;
		},
		isNonstandard: 'Custom',
		num: 3531,
		gen: 9,
		desc: "The holder cannot be struck by a critical hit.",
	},
	graniteanchor: {
		name: "Granite Anchor",
		spritenum: 0,
		onModifySpe(spe) {
			return this.chainModify(0.5);
		},
		onDragOut(pokemon) {
			this.add('-activate', pokemon, 'item: Granite Anchor');
			return null;
		},
		isNonstandard: 'Custom',
		num: 3532,
		gen: 9,
		desc: "Halves Speed, but the holder can never be forced out.",
	},
	petrifiedsap: {
		name: "Petrified Sap",
		spritenum: 0,
		onResidualOrder: 5,
		onResidual(pokemon) {
			if (!pokemon.effectiveWeather() && pokemon.hp < pokemon.maxhp) this.heal(pokemon.baseMaxhp / 16);
		},
		isNonstandard: 'Custom',
		num: 3533,
		gen: 9,
		desc: "Restores 1/16 max HP each turn while there is no weather.",
	},
	quartzspike: {
		name: "Quartz Spike",
		spritenum: 0,
		onModifyMove(move) {
			if (move.type === 'Ground') {
				if (!move.ignoreImmunity) move.ignoreImmunity = {};
				if (typeof move.ignoreImmunity !== 'boolean') move.ignoreImmunity['Ground'] = true;
			}
		},
		onEffectiveness(typeMod, target, type, move) {
			if (move.type === 'Ground' && type === 'Flying') return 0;
		},
		isNonstandard: 'Custom',
		num: 3534,
		gen: 9,
		desc: "The holder's Ground moves hit Flying types for neutral damage.",
	},
	brineencrustedstone: {
		name: "Brine-Encrusted Stone",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.type === 'Water') return this.chainModify([4915, 4096]);
		},
		onSourceModifyDamage(damage, source, target, move) {
			if (move.type === 'Fire') return this.chainModify(0.8);
		},
		isNonstandard: 'Custom',
		num: 3535,
		gen: 9,
		desc: "Water moves deal 15% more; incoming Fire moves deal 20% less.",
	},

	// -------------------------------------------- Tactical Gear & Armaments
	spikeshieldplating: {
		name: "Spike-Shield Plating",
		spritenum: 0,
		onSourceModifyDamage(damage, source, target, move) {
			if (move.flags['contact']) return this.chainModify(0.85);
		},
		onDamagingHit(damage, target, source, move) {
			if (!move.flags['contact'] || this.effectState.used) return;
			this.effectState.used = true;
			target.side.foe.addSideCondition('spikes', target, this.dex.items.get('spikeshieldplating'));
		},
		isNonstandard: 'Custom',
		num: 3536,
		gen: 9,
		desc: "Contact moves deal 15% less; once, a contact hit sets Spikes.",
	},
	springloadedboots: {
		name: "Spring-Loaded Boots",
		spritenum: 0,
		onDamage(damage, target, source, effect) {
			if (effect && ['stealthrock', 'spikes', 'livewire', 'fakemonbleedhazard'].includes(effect.id)) return false;
		},
		onTryHit(target, source, move) {
			if (move.id === 'stickyweb' || move.id === 'toxicspikes') return;
		},
		onSwitchIn(pokemon) {
			pokemon.addVolatile('fakemonhazardward', pokemon, this.dex.items.get('springloadedboots'));
		},
		isNonstandard: 'Custom',
		num: 3537,
		gen: 9,
		desc: "The holder ignores every entry hazard.",
	},
	executionergoggles: {
		name: "Executioner Goggles",
		spritenum: 0,
		onModifyCritRatio(critRatio, user, target, move) {
			if (move && isCuttingMove(move)) return critRatio + 1;
		},
		isNonstandard: 'Custom',
		num: 3538,
		gen: 9,
		desc: "Cutting and slashing moves have a higher critical hit ratio.",
	},
	payloadbelt: {
		name: "Payload Belt",
		spritenum: 0,
		onDamage(damage, target, source, effect) {
			if (effect?.id === 'recoil' || effect?.id === 'highjumpkick' || effect?.id === 'jumpkick') {
				return damage * 0.7;
			}
		},
		isNonstandard: 'Custom',
		num: 3539,
		gen: 9,
		desc: "Recoil and crash damage the holder takes is reduced by 30%.",
	},
	heavyplatedbracers: {
		name: "Heavy Plated Bracers",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.category === 'Physical' || isWeightMove(move)) return this.chainModify([4710, 4096]);
		},
		onModifySpe(spe) {
			return this.chainModify(0.95);
		},
		isNonstandard: 'Custom',
		num: 3540,
		gen: 9,
		desc: "Physical and weight-based moves deal 15% more; Speed drops 5%.",
	},
	targetingscope: {
		name: "Targeting Scope",
		spritenum: 0,
		onModifyMove(move, source, target) {
			// A move aimed at a faster target simply cannot miss.
			if (target && source.getStat('spe', false, true) < target.getStat('spe', false, true)) {
				move.accuracy = true;
			}
		},
		onSourceModifyAccuracy(accuracy, target, source, move) {
			if (typeof accuracy === 'number' && move.category === 'Physical') {
				return this.chainModify([4506, 4096]);
			}
		},
		isNonstandard: 'Custom',
		num: 3541,
		gen: 9,
		desc: "Physical moves are 10% more accurate; moves never miss a faster target.",
	},
	assaultvestment: {
		name: "Assault Vestment",
		spritenum: 0,
		onModifySpDPriority: 1,
		onModifySpD(spd) {
			return this.chainModify(1.5);
		},
		onDisableMove(pokemon) {
			for (const moveSlot of pokemon.moveSlots) {
				if (this.dex.moves.get(moveSlot.move).category === 'Status') {
					pokemon.disableMove(moveSlot.id);
				}
			}
		},
		isNonstandard: 'Custom',
		num: 3542,
		gen: 9,
		desc: "1.5x Sp. Def, but the holder cannot select status moves.",
	},
	counterweightweights: {
		name: "Counter-Weight Weights",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (isWeightMove(move)) return this.chainModify(1.25);
		},
		onSourceModifyDamage(damage, source, target, move) {
			if (isWeightMove(move)) return this.chainModify(0.75);
		},
		isNonstandard: 'Custom',
		num: 3543,
		gen: 9,
		desc: "Weight-based moves hit 25% harder from the holder and 25% softer at it.",
	},
	safetyharness: {
		name: "Safety Harness",
		spritenum: 0,
		onDamagePriority: -40,
		onDamage(damage, target, source, effect) {
			if (target.hp === target.maxhp && damage >= target.hp &&
				effect?.effectType === 'Move' && (effect as Move).ohko) {
				this.add('-activate', target, 'item: Safety Harness');
				return target.hp - 1;
			}
		},
		isNonstandard: 'Custom',
		num: 3544,
		gen: 9,
		desc: "From full HP the holder survives a one-hit KO move with 1 HP.",
	},
	adrenalineinjection: {
		name: "Adrenaline Injection",
		spritenum: 0,
		onAfterMoveSecondary(target, source, move) {
			if (this.effectState.used || move.category === 'Status') return;
			if (target.hp && target.hp * 2 <= target.maxhp) {
				this.effectState.used = true;
				this.boost({ atk: 1, spe: 1 }, target, target, this.dex.items.get('adrenalineinjection'));
			}
		},
		isNonstandard: 'Custom',
		num: 3545,
		gen: 9,
		desc: "Once, +1 Attack and Speed when an attack drops the holder below half HP.",
	},
	ironcollarring: {
		name: "Iron Collar Ring",
		spritenum: 0,
		onSourceModifyDamage(damage, source, target, move) {
			if (move.category === 'Physical' && move.flags['contact']) return this.chainModify(0.67);
			if (move.category === 'Special') return this.chainModify([4710, 4096]);
		},
		isNonstandard: 'Custom',
		num: 3546,
		gen: 9,
		desc: "Physical contact deals 33% less, special attacks 15% more.",
	},
	featherweightglider: {
		name: "Feather-Weight Glider",
		spritenum: 0,
		onTryHit(target, source, move) {
			const active = this.field.isTerrain('electricterrain') ||
				['raindance', 'primordialsea'].includes(target.effectiveWeather());
			if (active && target !== source && move.type === 'Ground' && move.category !== 'Status') {
				this.add('-immune', target, '[from] item: Feather-Weight Glider');
				return null;
			}
		},
		isNonstandard: 'Custom',
		num: 3547,
		gen: 9,
		desc: "In Electric Terrain or rain the holder is immune to Ground moves.",
	},
	bladedgauntlets: {
		name: "Bladed Gauntlets",
		spritenum: 0,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (!move.flags['contact'] || !target) return;
			if (target.volatiles['substitute'] || target.volatiles['protect'] ||
				target.volatiles['brickshelter'] || target.volatiles['banefulbunker']) {
				return this.chainModify([4506, 4096]);
			}
		},
		isNonstandard: 'Custom',
		num: 3548,
		gen: 9,
		desc: "Contact moves deal 10% more to shielded or substituted targets.",
	},
	smokescreencanister: {
		name: "Smokescreen Canister",
		spritenum: 0,
		onSwitchOut(pokemon) {
			if (this.effectState.used) return;
			this.effectState.used = true;
			for (const foe of pokemon.foes()) {
				this.boost({ accuracy: -1 }, foe, pokemon, this.dex.items.get('smokescreencanister'));
			}
		},
		isNonstandard: 'Custom',
		num: 3549,
		gen: 9,
		desc: "Once, every foe loses 1 stage of accuracy when the holder switches out.",
	},
	quickclawgreaves: {
		name: "Quick-Claw Greaves",
		spritenum: 0,
		onFractionalPriorityPriority: -2,
		onFractionalPriority(priority, pokemon) {
			if (this.randomChance(1, 5)) {
				this.add('-activate', pokemon, 'item: Quick-Claw Greaves');
				return 0.1;
			}
		},
		isNonstandard: 'Custom',
		num: 3550,
		gen: 9,
		desc: "20% chance for the holder to move first in its priority bracket.",
	},
};
