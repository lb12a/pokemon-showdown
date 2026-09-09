/**
 * Food items (Pokemon_Food_Items).
 *
 * 50 held foods in four families: Mushrooms, Bakery & Grains,
 * Fruits & Vegetables and Nuts/Proteins/Deli. Every one of them counts as a
 * food item for the abilities and moves that care (Crispy Charge, Sugar Rush,
 * Nibble, Evergreen Cud, Itemfinder, Nectar Dash) - see FOOD_ITEMS in items.ts.
 *
 * Items that trigger once are consumed with `eatItem`, so Nibble and the other
 * "eats a food item" mechanics interact with them; items that describe a
 * permanent held effect are never consumed.
 */
import { isRollingMove, isWeightMove, extendEffect, hasStatDrop } from './item-helpers';

export const FoodItems: import('../../../sim/dex-items').ModdedItemDataTable = {
	// ------------------------------------------------------------ Mushrooms
	voltsporeshroom: {
		name: "Volt-Spore Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.status === 'par') pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.cureStatus();
			this.boost({ spe: 1 }, pokemon, pokemon, this.dex.items.get('voltsporeshroom'));
		},
		isNonstandard: 'Custom',
		num: 3301,
		gen: 9,
		desc: "Cures paralysis and raises Speed by 1 stage. Single use.",
	},
	cindercapshroom: {
		name: "Cinder-Cap Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.status === 'brn') pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.cureStatus();
		},
		isNonstandard: 'Custom',
		num: 3302,
		gen: 9,
		desc: "Cures a burn. Single use.",
	},
	awakestalkshroom: {
		name: "Awake-Stalk Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.status === 'slp') pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.cureStatus();
		},
		isNonstandard: 'Custom',
		num: 3303,
		gen: 9,
		desc: "Wakes the holder up as soon as it falls asleep. Single use.",
	},
	thawrootshroom: {
		name: "Thaw-Root Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.status === 'frz') pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.cureStatus();
		},
		isNonstandard: 'Custom',
		num: 3304,
		gen: 9,
		desc: "Thaws the holder out when it is frozen. Single use.",
	},
	antidotegripshroom: {
		name: "Antidote-Grip Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.status === 'psn' || pokemon.status === 'tox') pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.cureStatus();
		},
		isNonstandard: 'Custom',
		num: 3305,
		gen: 9,
		desc: "Cures poison and bad poison. Single use.",
	},
	dewdropshroom: {
		name: "Dewdrop Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 2 <= pokemon.maxhp) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.heal(pokemon.baseMaxhp / 4);
		},
		isNonstandard: 'Custom',
		num: 3306,
		gen: 9,
		desc: "Restores 25% max HP at half HP or less. Single use.",
	},
	clearmindshroom: {
		name: "Clear-Mind Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.volatiles['confusion'] || pokemon.volatiles['attract']) pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.removeVolatile('confusion');
			pokemon.removeVolatile('attract');
		},
		isNonstandard: 'Custom',
		num: 3307,
		gen: 9,
		desc: "Cures confusion and infatuation. Single use.",
	},
	ragegillshroom: {
		name: "Rage-Gill Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 2 <= pokemon.maxhp) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.boost({ atk: 1 }, pokemon, pokemon, this.dex.items.get('ragegillshroom'));
		},
		isNonstandard: 'Custom',
		num: 3308,
		gen: 9,
		desc: "Raises Attack by 1 stage at half HP or less. Single use.",
	},
	ironshellshroom: {
		name: "Iron-Shell Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 2 <= pokemon.maxhp) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.boost({ def: 1 }, pokemon, pokemon, this.dex.items.get('ironshellshroom'));
		},
		isNonstandard: 'Custom',
		num: 3309,
		gen: 9,
		desc: "Raises Defense by 1 stage at half HP or less. Single use.",
	},
	focusbulbshroom: {
		name: "Focus-Bulb Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 2 <= pokemon.maxhp) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.boost({ spa: 1 }, pokemon, pokemon, this.dex.items.get('focusbulbshroom'));
		},
		isNonstandard: 'Custom',
		num: 3310,
		gen: 9,
		desc: "Raises Sp. Atk by 1 stage at half HP or less. Single use.",
	},
	spiritualcapshroom: {
		name: "Spiritual-Cap Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 2 <= pokemon.maxhp) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.boost({ spd: 1 }, pokemon, pokemon, this.dex.items.get('spiritualcapshroom'));
		},
		isNonstandard: 'Custom',
		num: 3311,
		gen: 9,
		desc: "Raises Sp. Def by 1 stage at half HP or less. Single use.",
	},
	swiftsproutshroom: {
		name: "Swift-Sprout Shroom",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 2 <= pokemon.maxhp) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.boost({ spe: 1 }, pokemon, pokemon, this.dex.items.get('swiftsproutshroom'));
		},
		isNonstandard: 'Custom',
		num: 3312,
		gen: 9,
		desc: "Raises Speed by 1 stage at half HP or less. Single use.",
	},
	aquaticspongeshroom: {
		name: "Aquatic Spongeshroom",
		spritenum: 0,
		isBerry: true,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.type === 'Water') return this.chainModify([4506, 4096]);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3313,
		gen: 9,
		desc: "The holder's Water-type moves deal 10% more damage.",
	},
	solarphotosshroom: {
		name: "Solar-Photos Shroom",
		spritenum: 0,
		isBerry: true,
		onResidualOrder: 5,
		onResidual(pokemon) {
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather()) && pokemon.hp < pokemon.maxhp) {
				this.heal(pokemon.baseMaxhp / 16);
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3314,
		gen: 9,
		desc: "Restores 1/16 max HP each turn in harsh sunlight.",
	},
	aridcrunchshroom: {
		name: "Arid Crunchshroom",
		spritenum: 0,
		isBerry: true,
		onImmunity(type) {
			if (type === 'sandstorm' || type === 'hail' || type === 'fakemonmiasma' || type === 'powder') return false;
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3315,
		gen: 9,
		desc: "The holder takes no damage from Sandstorm, Hail, Miasma or powder.",
	},

	// ------------------------------------------------------ Bakery & Grains
	hardcrustroll: {
		name: "Hard-Crust Roll",
		spritenum: 0,
		isBerry: true,
		onSourceModifyDamage(damage, source, target, move) {
			if (move.category === 'Physical' && move.flags['contact']) {
				target.eatItem(true);
				return this.chainModify(0.7);
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3316,
		gen: 9,
		desc: "Reduces the first physical contact move's damage by 30%, then is eaten.",
	},
	spicyfluffpastry: {
		name: "Spicy Fluff-Pastry",
		spritenum: 0,
		isBerry: true,
		onSourceModifyDamage(damage, source, target, move) {
			if (move.type === 'Ice') {
				target.eatItem(true);
				return this.chainModify(0.5);
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3317,
		gen: 9,
		desc: "Halves the damage of one Ice-type move, then is eaten.",
	},
	saltypretzel: {
		name: "Salty Pretzel",
		spritenum: 0,
		isBerry: true,
		onTryBoost(boost, target, source, effect) {
			if (!source || target === source || effect?.id === 'saltypretzel') return;
			let dropped = false;
			let stat: BoostID;
			for (stat in boost) {
				if (boost[stat]! < 0) {
					delete boost[stat];
					dropped = true;
				}
			}
			if (dropped) {
				this.add('-fail', target, 'unboost', '[from] item: Salty Pretzel');
				target.eatItem(true);
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3318,
		gen: 9,
		desc: "Blocks one stat drop caused by the opponent, then is eaten.",
	},
	sweethoneybun: {
		name: "Sweet Honey-Bun",
		spritenum: 0,
		isBerry: true,
		onSwitchIn(pokemon) {
			if (pokemon.side.getSideCondition('stickyweb')) {
				pokemon.side.removeSideCondition('stickyweb');
				this.add('-sideend', pokemon.side, 'Sticky Web', '[from] item: Sweet Honey-Bun', `[of] ${pokemon}`);
				pokemon.eatItem(true);
			}
		},
		onDamage(damage, target, source, effect) {
			if (effect?.id === 'stealthrock') return damage / 2;
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3319,
		gen: 9,
		desc: "Removes Sticky Web on entry; halves Stealth Rock damage.",
	},
	bitterbranbiscuit: {
		name: "Bitter Bran-Biscuit",
		spritenum: 0,
		isBerry: true,
		onFlinch(pokemon) {
			if (pokemon.eatItem()) {
				this.boost({ spe: 1 }, pokemon, pokemon, this.dex.items.get('bitterbranbiscuit'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3320,
		gen: 9,
		desc: "Raises Speed by 1 stage when the holder flinches. Single use.",
	},
	crackedwheatloaf: {
		name: "Cracked Wheat-Loaf",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 2 <= pokemon.maxhp) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.heal(40, pokemon);
		},
		isNonstandard: 'Custom',
		num: 3321,
		gen: 9,
		desc: "Restores a flat 40 HP at half HP or less. Single use.",
	},
	sugarpowdereddonut: {
		name: "Sugar-Powdered Donut",
		spritenum: 0,
		isBerry: true,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.multihit) return this.chainModify(1.2);
		},
		onAfterMove(source, target, move) {
			if (move.multihit) source.eatItem(true);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3322,
		gen: 9,
		desc: "The holder's next multi-strike move deals 20% more damage.",
	},
	garlicflatbread: {
		name: "Garlic Flatbread",
		spritenum: 0,
		isBerry: true,
		onSourceModifyDamage(damage, source, target, move) {
			if (move.flags['bite']) return this.chainModify(0.75);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3323,
		gen: 9,
		desc: "Biting moves deal 25% less damage to the holder.",
	},
	moondustedcroissant: {
		name: "Moon-Dusted Croissant",
		spritenum: 0,
		// The extension itself lives in the fullmoon condition's durationCallback.
		onSwitchIn(pokemon) {
			if (this.field.isWeather('fullmoon')) {
				extendEffect(this.field.weatherState, 2, 'fakemonCroissant');
			}
		},
		isNonstandard: 'Custom',
		num: 3324,
		gen: 9,
		desc: "Full Moon lasts 2 turns longer while the holder is around.",
	},
	elerollcracker: {
		name: "Eleroll Cracker",
		spritenum: 0,
		isBerry: true,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (isRollingMove(move)) return this.chainModify([4915, 4096]);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3325,
		gen: 9,
		desc: "The holder's rolling and spinning moves deal 15% more damage.",
	},

	// ------------------------------------------------- Fruits & Vegetables
	sourzestpeel: {
		name: "Sour Zest-Peel",
		spritenum: 0,
		isBerry: true,
		onTryBoost(boost, target, source) {
			if (source && target === source) return;
			for (const stat of ['def', 'spd'] as BoostID[]) {
				const value = boost[stat];
				if (value && value < 0) boost[stat] = Math.min(0, value + 1);
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3326,
		gen: 9,
		desc: "Defense and Sp. Def drops from the foe are one stage smaller.",
	},
	shockchargedberry: {
		name: "Shock-Charged Berry",
		spritenum: 0,
		isBerry: true,
		onTerrainChange() {
			if (this.field.isTerrain('electricterrain')) {
				extendEffect(this.field.terrainState, 2, 'fakemonShockBerry');
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3327,
		gen: 9,
		desc: "Electric Terrain lasts 2 turns longer while the holder is around.",
	},
	bogrootcarrot: {
		name: "Bog-Root Carrot",
		spritenum: 0,
		isBerry: true,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.type === 'Ground' && ['raindance', 'primordialsea'].includes(user.effectiveWeather())) {
				return this.chainModify([4915, 4096]);
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3328,
		gen: 9,
		desc: "The holder's Ground-type moves deal 15% more damage in rain.",
	},
	snappepeapods: {
		name: "Snap-PePea Pods",
		spritenum: 0,
		isBerry: true,
		onSourceModifyAccuracy(accuracy, target, source) {
			if (typeof accuracy === 'number' && source.m.fakemonMissedLastTurn) {
				return this.chainModify(1.2);
			}
		},
		onAfterMove(source, target, move) {
			if (move.category === 'Status') return;
			source.m.fakemonMissedLastTurn = source.moveThisTurnResult === false;
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3329,
		gen: 9,
		desc: "20% more accurate on the turn after the holder missed.",
	},
	ghostpepperchili: {
		name: "Ghost-Pepper Chili",
		spritenum: 0,
		isBerry: true,
		onModifySpAPriority: 1,
		onModifySpA(spa, pokemon) {
			if (pokemon.hasType('Ghost')) return this.chainModify([4506, 4096]);
		},
		onResidualOrder: 5,
		onResidual(pokemon) {
			if (!pokemon.hasType('Ghost')) {
				this.damage(pokemon.baseMaxhp / 16, pokemon, pokemon, this.dex.items.get('ghostpepperchili'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3330,
		gen: 9,
		desc: "Ghost types get 1.1x Sp. Atk; anything else loses 1/16 max HP a turn.",
	},
	heavyironpumpkin: {
		name: "Heavy Iron-Pumpkin",
		spritenum: 0,
		isBerry: true,
		onModifyWeight(weighthg) {
			return weighthg * 2;
		},
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (isWeightMove(move)) return this.chainModify([4915, 4096]);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3331,
		gen: 9,
		desc: "Doubles the holder's weight; its weight-based moves hit 15% harder.",
	},
	miraclebloombud: {
		name: "Miracle Bloom-Bud",
		spritenum: 0,
		isBerry: true,
		onTerrainChange(pokemon) {
			if (this.field.isTerrain('grassyterrain') && pokemon.hp < pokemon.maxhp) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.heal(pokemon.baseMaxhp * 0.15, pokemon);
		},
		isNonstandard: 'Custom',
		num: 3332,
		gen: 9,
		desc: "Restores 15% max HP when Grassy Terrain starts. Single use.",
	},
	glossywaxapple: {
		name: "Glossy Wax-Apple",
		spritenum: 0,
		isBerry: true,
		onSideConditionStart(side, source, sideCondition) {
			if (!['reflect', 'lightscreen', 'auroraveil'].includes(sideCondition.id)) return;
			extendEffect(side.sideConditions[sideCondition.id], 1, 'fakemonWaxApple');
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3333,
		gen: 9,
		desc: "Screens set on the holder's side last 1 turn longer.",
	},
	aquamakimelon: {
		name: "Aqua-Maki Melon",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			const types = pokemon.getTypes().join('/');
			if (pokemon.m.fakemonMelonTypes === undefined) {
				pokemon.m.fakemonMelonTypes = types;
			} else if (pokemon.m.fakemonMelonTypes !== types) {
				pokemon.m.fakemonMelonTypes = types;
				pokemon.eatItem();
			}
		},
		onEat(pokemon) {
			this.heal(pokemon.baseMaxhp * 0.2, pokemon);
		},
		isNonstandard: 'Custom',
		num: 3334,
		gen: 9,
		desc: "Restores 20% max HP when the holder's typing changes. Single use.",
	},
	crystallineradish: {
		name: "Crystalline Radish",
		spritenum: 0,
		isBerry: true,
		onSourceModifyDamage(damage, source, target, move) {
			if (['Rock', 'Steel'].includes(move.type) && target.getMoveHitData(move).typeMod > 0) {
				target.eatItem(true);
				return this.chainModify(0.5);
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3335,
		gen: 9,
		desc: "Halves one super effective Rock or Steel hit, then is eaten.",
	},

	// -------------------------------------------------- Nuts, Proteins & Deli
	mahoganyacorn: {
		name: "Mahogany Acorn",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Psychic' && target.eatItem()) {
				this.boost({ def: 1 }, target, target, this.dex.items.get('mahoganyacorn'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3336,
		gen: 9,
		desc: "Raises Defense by 1 stage when hit by a Psychic move. Single use.",
	},
	crispycricketsnack: {
		name: "Crispy Cricket-Snack",
		spritenum: 0,
		isBerry: true,
		onModifyPriority(priority, pokemon, target, move) {
			if (move?.category === 'Status' && pokemon.hasType('Bug') && !pokemon.m.fakemonCricketUsed) {
				return priority + 1;
			}
		},
		onAfterMove(source, target, move) {
			if (move.category === 'Status' && source.hasType('Bug')) source.m.fakemonCricketUsed = true;
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3337,
		gen: 9,
		desc: "A Bug-type holder's first status move gains +1 priority.",
	},
	smokedtallowjerky: {
		name: "Smoked Tallow-Jerky",
		spritenum: 0,
		onDamagePriority: -40,
		onDamage(damage, target, source, effect) {
			if (target.hp === target.maxhp && damage >= target.hp && effect?.effectType === 'Move') {
				if (target.useItem()) return target.hp - Math.floor(target.maxhp / 2);
			}
		},
		isNonstandard: 'Custom',
		num: 3338,
		gen: 9,
		desc: "Once, a KO from full HP leaves the holder at half HP instead.",
	},
	brinykelpwrap: {
		name: "Briny Kelp-Wrap",
		spritenum: 0,
		isBerry: true,
		onSwitchOut(pokemon) {
			if (pokemon.hp && pokemon.hp < pokemon.maxhp) this.heal(pokemon.baseMaxhp / 8, pokemon);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3339,
		gen: 9,
		desc: "Restores 1/8 max HP whenever the holder switches out.",
	},
	stickyhoneycomb: {
		name: "Sticky Honey-Comb",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.flags['contact']) {
				this.boost({ spe: -1 }, source, target, this.dex.items.get('stickyhoneycomb'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3340,
		gen: 9,
		desc: "Contact attackers lose 1 stage of Speed.",
	},
	roastedchestnut: {
		name: "Roasted Chestnut",
		spritenum: 0,
		isBerry: true,
		onDamage(damage, target, source, effect) {
			if (effect?.id === 'recoil' && target.eatItem(true)) return damage / 2;
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3341,
		gen: 9,
		desc: "Halves one instance of recoil damage, then is eaten.",
	},
	featherlightseedmix: {
		name: "Feather-Light Seedmix",
		spritenum: 0,
		isBerry: true,
		onModifySpe(spe) {
			return this.chainModify([4506, 4096]);
		},
		onModifyWeight(weighthg) {
			return weighthg / 2;
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3342,
		gen: 9,
		desc: "1.1x Speed, but the holder weighs half as much.",
	},
	hardshellwalnut: {
		name: "Hard Shell-Walnut",
		spritenum: 0,
		isBerry: true,
		onAfterMove(source, target, move) {
			if (move.stallingMove) {
				this.boost({ spd: 1 }, source, source, this.dex.items.get('hardshellwalnut'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3343,
		gen: 9,
		desc: "Raises Sp. Def by 1 stage whenever the holder uses a protecting move.",
	},
	purifyingserpentegg: {
		name: "Purifying Serpent-Egg",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 10 <= pokemon.maxhp * 3 && hasStatDrop(pokemon)) pokemon.eatItem();
		},
		onEat(pokemon) {
			let stat: BoostID;
			for (stat in pokemon.boosts) {
				if (pokemon.boosts[stat] < 0) pokemon.boosts[stat] = 0;
			}
			this.add('-clearnegativeboost', pokemon, '[silent]');
			this.add('-message', `${pokemon.name} shook off its stat drops!`);
		},
		isNonstandard: 'Custom',
		num: 3344,
		gen: 9,
		desc: "Clears all lowered stats below 30% HP. Single use.",
	},
	fusedeleckernel: {
		name: "Fused Elec-Kernel",
		spritenum: 0,
		isBerry: true,
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Electric') {
				if (!target.eatItem(true)) return;
				if (!this.heal(target.baseMaxhp / 4, target)) {
					this.add('-immune', target, '[from] item: Fused Elec-Kernel');
				}
				return null;
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3345,
		gen: 9,
		desc: "Absorbs one Electric-type move and restores 25% max HP instead.",
	},
	dreadoozejelly: {
		name: "Dread-Ooze Jelly",
		spritenum: 0,
		isBerry: true,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.type === 'Dark' && target && hasStatDrop(target)) return this.chainModify(1.2);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3346,
		gen: 9,
		desc: "Dark moves deal 1.2x damage to targets with a lowered stat.",
	},
	timewarpedraisin: {
		name: "Time-Warped Raisin",
		spritenum: 0,
		isBerry: true,
		onFractionalPriorityPriority: -2,
		onFractionalPriority(priority, pokemon) {
			if (pokemon.eatItem()) {
				this.add('-activate', pokemon, 'item: Time-Warped Raisin');
				return 0.1;
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3347,
		gen: 9,
		desc: "Once, the holder moves first within its priority bracket.",
	},
	malwarebaittruffle: {
		name: "Malware-Bait Truffle",
		spritenum: 0,
		isBerry: true,
		onTakeItem(item, pokemon, source) {
			if (source && source !== pokemon) {
				source.addVolatile('fakemonitemabilitylock', pokemon, this.dex.items.get('malwarebaittruffle'));
			}
			return true;
		},
		onEat(pokemon) {
			pokemon.addVolatile('fakemonitemabilitylock', pokemon, this.dex.items.get('malwarebaittruffle'));
		},
		isNonstandard: 'Custom',
		num: 3348,
		gen: 9,
		desc: "Whoever steals or eats it has its Ability suppressed for 3 turns.",
	},
	sweetcrushcandy: {
		name: "Sweet-Crush Candy",
		spritenum: 0,
		isBerry: true,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			const streak: number = user.m.fakemonCrushStreak || 0;
			if (streak > 0) return this.chainModify([4096 + Math.min(streak, 5) * 410, 4096]);
		},
		onAfterMove(source, target, move) {
			if (move.category === 'Status') {
				source.m.fakemonCrushStreak = 0;
			} else if (source.m.fakemonCrushLast === move.id) {
				source.m.fakemonCrushStreak = (source.m.fakemonCrushStreak || 0) + 1;
			} else {
				source.m.fakemonCrushLast = move.id;
				source.m.fakemonCrushStreak = 0;
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3349,
		gen: 9,
		desc: "Repeating the same attack adds 10% power per repeat, up to +50%.",
	},
	volcanicrocksalt: {
		name: "Volcanic Rock-Salt",
		spritenum: 0,
		isBerry: true,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.type === 'Fire' || move.type === 'Ground') return this.chainModify([4506, 4096]);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3350,
		gen: 9,
		desc: "The holder's Fire- and Ground-type moves deal 10% more damage.",
	},
};
