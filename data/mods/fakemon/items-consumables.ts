/**
 * Unique consumable items (New_Unique_Consumable_Items).
 *
 * 50 single-use items in four families: Infusions & Brews, Confections &
 * Pastries, Baked Delicacies and Wilderness Harvest. Each one waits for the
 * trigger written on its spreadsheet row, fires once and is gone.
 *
 * They are all edible, so they count as food items (FOOD_ITEMS in items.ts) and
 * work with Nibble, Evergreen Cud, Itemfinder and the other food mechanics.
 */
import { isRollingMove, isWeightMove } from './item-helpers';

export const ConsumableItems: import('../../../sim/dex-items').ModdedItemDataTable = {
	// ----------------------------------------------------- Infusions & Brews
	thermalflaskbrew: {
		name: "Thermal Flask-Brew",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Ice') target.eatItem();
		},
		onEat(pokemon) {
			this.field.setWeather('sunnyday', pokemon, this.dex.items.get('thermalflaskbrew'));
			if (this.field.isWeather('sunnyday')) this.field.weatherState.duration = 3;
		},
		isNonstandard: 'Custom',
		num: 3401,
		gen: 9,
		desc: "When hit by an Ice move, sets harsh sunlight for 3 turns. Single use.",
	},
	staticinfusedtonic: {
		name: "Static-Infused Tonic",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 2 <= pokemon.maxhp) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.field.setTerrain('electricterrain', pokemon, this.dex.items.get('staticinfusedtonic'));
			if (this.field.isTerrain('electricterrain')) this.field.terrainState.duration = 3;
		},
		isNonstandard: 'Custom',
		num: 3402,
		gen: 9,
		desc: "At half HP or less, sets Electric Terrain for 3 turns. Single use.",
	},
	spookyspiritnectar: {
		name: "Spooky Spirit-Nectar",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (!pokemon.hasType('Ghost')) return;
			const foe = pokemon.foes()[0];
			if (!foe) return;
			let better = false;
			let stat: BoostID;
			for (stat in foe.boosts) {
				if (foe.boosts[stat] > pokemon.boosts[stat]) better = true;
			}
			if (better) pokemon.eatItem();
		},
		onEat(pokemon) {
			const foe = pokemon.foes()[0];
			if (!foe) return;
			const mine = pokemon.boosts;
			pokemon.setBoost(foe.boosts);
			foe.setBoost(mine);
			this.add('-swapboost', pokemon, foe, '[from] item: Spooky Spirit-Nectar');
		},
		isNonstandard: 'Custom',
		num: 3403,
		gen: 9,
		desc: "A Ghost-type holder swaps stat stages with the foe. Single use.",
	},
	brinyseabroth: {
		name: "Briny Sea-Broth",
		spritenum: 0,
		isBerry: true,
		onWeatherChange(pokemon) {
			if (['raindance', 'primordialsea'].includes(pokemon.effectiveWeather())) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.heal(pokemon.baseMaxhp * 0.2, pokemon);
		},
		isNonstandard: 'Custom',
		num: 3404,
		gen: 9,
		desc: "Restores 20% max HP when rain starts. Single use.",
	},
	glitchedenergydrink: {
		name: "Glitched Energy-Drink",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (this.field.getPseudoWeather('glitchedroom')) pokemon.eatItem();
		},
		onEat(pokemon) {
			let lowest: BoostID = 'atk';
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as BoostID[]) {
				if (pokemon.storedStats[stat as StatIDExceptHP] < pokemon.storedStats[lowest as StatIDExceptHP]) lowest = stat;
			}
			this.boost({ [lowest]: 2 }, pokemon, pokemon, this.dex.items.get('glitchedenergydrink'));
		},
		isNonstandard: 'Custom',
		num: 3405,
		gen: 9,
		desc: "In a Glitched Room, raises the holder's lowest stat by 2. Single use.",
	},
	echoingsodapop: {
		name: "Echoing Soda-Pop",
		spritenum: 0,
		isBerry: true,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.flags['sound'] && user.m.fakemonSodaReady) return this.chainModify(1.3);
		},
		onAfterMove(source, target, move) {
			if (!move.flags['sound']) return;
			if (source.m.fakemonSodaReady) {
				source.m.fakemonSodaReady = false;
				source.eatItem(true);
			} else {
				source.m.fakemonSodaReady = true;
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3406,
		gen: 9,
		desc: "After a sound move, the holder's next sound move deals 30% more damage.",
	},
	volcanicmagmachai: {
		name: "Volcanic Magma-Chai",
		spritenum: 0,
		isBerry: true,
		onSwitchIn(pokemon) {
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.boost({ atk: 1 }, pokemon, pokemon, this.dex.items.get('volcanicmagmachai'));
		},
		isNonstandard: 'Custom',
		num: 3407,
		gen: 9,
		desc: "Raises Attack by 1 stage on entry in sunlight. Single use.",
	},
	magneticoilblend: {
		name: "Magnetic Oil-Blend",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Steel') target.eatItem();
		},
		onEat(pokemon) {
			this.boost({ def: 1, spd: 1 }, pokemon, pokemon, this.dex.items.get('magneticoilblend'));
		},
		isNonstandard: 'Custom',
		num: 3408,
		gen: 9,
		desc: "Raises Defense and Sp. Def by 1 when hit by a Steel move. Single use.",
	},
	aromaticherbalextract: {
		name: "Aromatic Herbal-Extract",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.volatiles['taunt'] || pokemon.volatiles['torment'] || pokemon.volatiles['encore']) {
				pokemon.eatItem();
			}
		},
		onEat(pokemon) {
			for (const id of ['taunt', 'torment', 'encore']) pokemon.removeVolatile(id);
		},
		isNonstandard: 'Custom',
		num: 3409,
		gen: 9,
		desc: "Cures Taunt, Torment and Encore. Single use.",
	},
	bogwaterelixir: {
		name: "Bog-Water Elixir",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Ground') target.eatItem();
		},
		onEat(pokemon) {
			const types = pokemon.getTypes();
			if (pokemon.setType([types[0], 'Ground'])) {
				this.add('-start', pokemon, 'typechange', pokemon.getTypes().join('/'), '[from] item: Bog-Water Elixir');
			}
		},
		isNonstandard: 'Custom',
		num: 3410,
		gen: 9,
		desc: "When hit by a Ground move, the holder's second type becomes Ground.",
	},
	clearskydistillate: {
		name: "Clear-Sky Distillate",
		spritenum: 0,
		isBerry: true,
		onDamage(damage, target, source, effect) {
			if (effect?.effectType === 'Weather') target.eatItem(true);
		},
		onEat() {
			this.field.clearWeather();
			this.add('-message', `The sky cleared up!`);
		},
		isNonstandard: 'Custom',
		num: 3411,
		gen: 9,
		desc: "Clears the weather the first time weather damages the holder.",
	},
	mistyflowertea: {
		name: "Misty Flower-Tea",
		spritenum: 0,
		isBerry: true,
		onSwitchIn(pokemon) {
			if (this.field.isTerrain('mistyterrain')) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.boost({ spd: 1 }, pokemon, pokemon, this.dex.items.get('mistyflowertea'));
		},
		isNonstandard: 'Custom',
		num: 3412,
		gen: 9,
		desc: "Raises Sp. Def by 1 stage on entry in Misty Terrain. Single use.",
	},
	adrenalinecoldbrew: {
		name: "Adrenaline Cold-Brew",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp === 1) pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.addVolatile('fakemonpriorityrush', pokemon, this.dex.items.get('adrenalinecoldbrew'));
		},
		isNonstandard: 'Custom',
		num: 3413,
		gen: 9,
		desc: "At exactly 1 HP, the holder's next move gains +2 priority. Single use.",
	},
	toxicpurgevial: {
		name: "Toxic-Purge Vial",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.status === 'psn' || pokemon.status === 'tox') pokemon.eatItem();
		},
		onEat(pokemon) {
			const source = pokemon.m.fakemonStatusSource as Pokemon | undefined;
			pokemon.cureStatus();
			if (source?.isActive) source.trySetStatus('psn', pokemon, this.dex.items.get('toxicpurgevial'));
		},
		isNonstandard: 'Custom',
		num: 3414,
		gen: 9,
		desc: "Cures poison and poisons whoever caused it. Single use.",
	},
	lunardewessence: {
		name: "Lunar-Dew Essence",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (this.field.isWeather('fullmoon') && pokemon.moveSlots[0]?.pp < pokemon.moveSlots[0]?.maxpp) {
				pokemon.eatItem();
			}
		},
		onEat(pokemon) {
			const slot = pokemon.moveSlots[0];
			if (!slot) return;
			slot.pp = slot.maxpp;
			this.add('-activate', pokemon, 'item: Lunar-Dew Essence', slot.move);
		},
		isNonstandard: 'Custom',
		num: 3415,
		gen: 9,
		desc: "Under Full Moon, fully restores the first move's PP. Single use.",
	},

	// ------------------------------------------------ Confections & Pastries
	glazedsugarshard: {
		name: "Glazed Sugar-Shard",
		spritenum: 0,
		isBerry: true,
		onModifyDamage(damage, source, target, move) {
			if (target.getMoveHitData(move).crit && source.m.fakemonSugarShard) return this.chainModify(1.2);
		},
		onAfterMoveSecondarySelf(source, target, move) {
			if (target?.getMoveHitData(move).crit) {
				source.m.fakemonSugarShard = true;
				source.eatItem(true);
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3416,
		gen: 9,
		desc: "After a critical hit, the holder's critical hits deal 20% more damage.",
	},
	gooeymarshmallowblob: {
		name: "Gooey Marshmallow-Blob",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.category !== 'Physical') return;
			if (target.eatItem()) {
				source.addVolatile('partiallytrapped', target, this.dex.items.get('gooeymarshmallowblob'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3417,
		gen: 9,
		desc: "Traps the attacker of a physical move for several turns. Single use.",
	},
	sourpowderbomb: {
		name: "Sour Powder-Bomb",
		spritenum: 0,
		isBerry: true,
		onAfterEachBoost(boost, target, source) {
			if (!source || target.isAlly(source)) return;
			let dropped = false;
			let stat: BoostID;
			for (stat in boost) {
				if (boost[stat]! < 0) dropped = true;
			}
			if (dropped && target.eatItem(true)) {
				this.boost({ def: -1 }, source, target, this.dex.items.get('sourpowderbomb'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3418,
		gen: 9,
		desc: "When a foe lowers the holder's stats, its Defense drops by 1. Single use.",
	},
	spicypepperchew: {
		name: "Spicy Pepper-Chew",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.status === 'frz') pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.cureStatus();
			this.boost({ atk: 1 }, pokemon, pokemon, this.dex.items.get('spicypepperchew'));
		},
		isNonstandard: 'Custom',
		num: 3419,
		gen: 9,
		desc: "Thaws the holder and raises Attack by 1 stage. Single use.",
	},
	darkchocganache: {
		name: "Dark-Choc Ganache",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.type !== 'Dark') return;
			if (!target.eatItem()) return;
			for (const state of Object.values(this.field.pseudoWeather)) {
				if (typeof state.duration === 'number') state.duration++;
			}
			this.add('-activate', target, 'item: Dark-Choc Ganache');
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3420,
		gen: 9,
		desc: "When hit by a Dark move, every active Room lasts 1 turn longer.",
	},
	peppermintcrunchbar: {
		name: "Peppermint Crunch-Bar",
		spritenum: 0,
		isBerry: true,
		onFlinch(pokemon) {
			pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.addVolatile('fakemonflinchguard', pokemon, this.dex.items.get('peppermintcrunchbar'));
		},
		isNonstandard: 'Custom',
		num: 3421,
		gen: 9,
		desc: "After flinching once, the holder cannot flinch again. Single use.",
	},
	goldenhoneydrop: {
		name: "Golden Honey-Drop",
		spritenum: 0,
		isBerry: true,
		onSourceModifyDamage(damage, source, target, move) {
			if (target.hp === target.maxhp && target.getMoveHitData(move).typeMod > 0) {
				target.eatItem(true);
				return this.chainModify(0.5);
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3422,
		gen: 9,
		desc: "At full HP, halves the first super effective hit. Single use.",
	},
	fizzingrockcandy: {
		name: "Fizzing Rock-Candy",
		spritenum: 0,
		isBerry: true,
		onTerrainChange(pokemon) {
			if (pokemon.m.fakemonSawElectricTerrain && !this.field.isTerrain('electricterrain')) {
				pokemon.eatItem();
			}
			pokemon.m.fakemonSawElectricTerrain = this.field.isTerrain('electricterrain');
		},
		onEat(pokemon) {
			this.boost({ spe: 1 }, pokemon, pokemon, this.dex.items.get('fizzingrockcandy'));
		},
		isNonstandard: 'Custom',
		num: 3423,
		gen: 9,
		desc: "Raises Speed by 1 stage when Electric Terrain ends. Single use.",
	},
	carameltraptwist: {
		name: "Caramel Trap-Twist",
		spritenum: 0,
		isBerry: true,
		onTakeItem(item, pokemon, source) {
			if (source && source !== pokemon) {
				this.boost({ spe: -2 }, source, pokemon, this.dex.items.get('carameltraptwist'));
			}
			return true;
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3424,
		gen: 9,
		desc: "Whoever removes it loses 2 stages of Speed.",
	},
	fullmoonmacaron: {
		name: "Full-Moon Macaron",
		spritenum: 0,
		isBerry: true,
		onWeatherChange(pokemon) {
			if (pokemon.m.fakemonSawFullMoon && !this.field.isWeather('fullmoon')) pokemon.eatItem();
			pokemon.m.fakemonSawFullMoon = this.field.isWeather('fullmoon');
		},
		onEat(pokemon) {
			this.field.setWeather('fullmoon', pokemon, this.dex.items.get('fullmoonmacaron'));
			if (this.field.isWeather('fullmoon')) this.field.weatherState.duration = 2;
		},
		isNonstandard: 'Custom',
		num: 3425,
		gen: 9,
		desc: "When Full Moon ends, sets it again for 2 turns. Single use.",
	},

	// -------------------------------------------------------- Baked Delicacies
	sourdoughboule: {
		name: "Sourdough Boule",
		spritenum: 0,
		isBerry: true,
		onSwitchIn(pokemon) {
			if (Object.keys(pokemon.side.sideConditions).length) pokemon.m.fakemonBouleActive = true;
		},
		onDamage(damage, target, source, effect) {
			if (target.m.fakemonBouleActive && effect && !(effect as ActiveMove).category &&
				['stealthrock', 'spikes', 'livewire', 'fakemonbleedhazard'].includes(effect.id)) {
				target.m.fakemonBouleActive = false;
				target.eatItem(true);
				return damage / 2;
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3426,
		gen: 9,
		desc: "Halves the entry hazard damage of one switch-in. Single use.",
	},
	cheesytwisterstick: {
		name: "Cheesy Twister-Stick",
		spritenum: 0,
		isBerry: true,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (isRollingMove(move)) return this.chainModify(1.25);
		},
		onAfterMove(source, target, move) {
			if (isRollingMove(move)) source.eatItem(true);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3427,
		gen: 9,
		desc: "The holder's next rolling or spinning move deals 25% more damage.",
	},
	charcoalbriochebun: {
		name: "Charcoal Brioche-Bun",
		spritenum: 0,
		isBerry: true,
		onSetStatus(status, target, source, effect) {
			if (status.id !== 'brn') return;
			if (target.eatItem(true)) {
				this.add('-immune', target, '[from] item: Charcoal Brioche-Bun');
				this.boost({ def: 1 }, target, target, this.dex.items.get('charcoalbriochebun'));
				return false;
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3428,
		gen: 9,
		desc: "Blocks one burn and raises Defense by 1 stage instead. Single use.",
	},
	fluffypancakestack: {
		name: "Fluffy Pancake-Stack",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 2 <= pokemon.maxhp) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.heal(pokemon.baseMaxhp * 0.2, pokemon);
			for (const ally of pokemon.adjacentAllies()) {
				this.heal(ally.baseMaxhp * 0.2, ally, pokemon, this.dex.items.get('fluffypancakestack'));
			}
		},
		isNonstandard: 'Custom',
		num: 3429,
		gen: 9,
		desc: "Restores 20% max HP to the holder and its ally. Single use.",
	},
	seededryecracker: {
		name: "Seeded Rye-Cracker",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.flags['contact'] && target.eatItem()) {
				this.damage(15, source, target, this.dex.items.get('seededryecracker'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3430,
		gen: 9,
		desc: "Deals a flat 15 HP back to a contact attacker. Single use.",
	},
	sweetpotatopie: {
		name: "Sweet Potato-Pie",
		spritenum: 0,
		isBerry: true,
		onSwitchIn(pokemon) {
			pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.addVolatile('fakemonheavyload', pokemon, this.dex.items.get('sweetpotatopie'));
		},
		isNonstandard: 'Custom',
		num: 3431,
		gen: 9,
		desc: "On entry, quadruples the holder's weight for 3 turns. Single use.",
	},
	herbcrustedfocaccia: {
		name: "Herb-Crusted Focaccia",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.status && pokemon.adjacentAllies().some(ally => !ally.status)) pokemon.eatItem();
		},
		onEat(pokemon) {
			const ally = pokemon.adjacentAllies().find(mon => !mon.status);
			if (!ally || !pokemon.status) return;
			const status = pokemon.status;
			pokemon.cureStatus();
			ally.trySetStatus(status, pokemon, this.dex.items.get('herbcrustedfocaccia'));
		},
		isNonstandard: 'Custom',
		num: 3432,
		gen: 9,
		desc: "Passes the holder's status to a healthy ally. Single use.",
	},
	puffedricecrispy: {
		name: "Puffed Rice-Crispy",
		spritenum: 0,
		isBerry: true,
		onSourceModifyDamage(damage, source, target, move) {
			if (isWeightMove(move)) {
				target.eatItem(true);
				return this.chainModify(0.5);
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3433,
		gen: 9,
		desc: "Halves one weight-based move's damage. Single use.",
	},
	cinnamonrollknot: {
		name: "Cinnamon Roll-Knot",
		spritenum: 0,
		isBerry: true,
		onSwitchOut(pokemon) {
			pokemon.side.addSideCondition('fakemonwelcomeheal', pokemon, this.dex.items.get('cinnamonrollknot'));
			pokemon.eatItem(true);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3434,
		gen: 9,
		desc: "The Pokemon that replaces the holder is healed 15% max HP. Single use.",
	},
	savorymeatpasty: {
		name: "Savory Meat-Pasty",
		spritenum: 0,
		isBerry: true,
		onSourceAfterFaint(length, target, source, effect) {
			if (effect?.effectType === 'Move' && source.eatItem()) {
				this.boost({ def: 1 }, source, source, this.dex.items.get('savorymeatpasty'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3435,
		gen: 9,
		desc: "Raises Defense by 1 stage after the holder knocks a foe out. Single use.",
	},

	// ------------------------------------------------------ Wilderness Harvest
	pricklycactuspear: {
		name: "Prickly Cactus-Pear",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Water') target.eatItem();
		},
		onEat(pokemon) {
			this.boost({ atk: 1 }, pokemon, pokemon, this.dex.items.get('pricklycactuspear'));
		},
		isNonstandard: 'Custom',
		num: 3436,
		gen: 9,
		desc: "Raises Attack by 1 stage when hit by a Water move. Single use.",
	},
	frostbittenplum: {
		name: "Frost-Bitten Plum",
		spritenum: 0,
		isBerry: true,
		onWeatherChange(pokemon) {
			if (['hail', 'snowscape'].includes(pokemon.effectiveWeather())) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.boost({ spa: 1 }, pokemon, pokemon, this.dex.items.get('frostbittenplum'));
		},
		isNonstandard: 'Custom',
		num: 3437,
		gen: 9,
		desc: "Raises Sp. Atk by 1 stage in hail or snow. Single use.",
	},
	sunbakedkernel: {
		name: "Sun-Baked Kernel",
		spritenum: 0,
		isBerry: true,
		onWeatherChange(pokemon) {
			if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.addVolatile('fakemonsecondaryward', pokemon, this.dex.items.get('sunbakedkernel'));
		},
		isNonstandard: 'Custom',
		num: 3438,
		gen: 9,
		desc: "In sunlight, blocks special-move secondary effects for 5 turns. Single use.",
	},
	deeprootedtruffle: {
		name: "Deep-Rooted Truffle",
		spritenum: 0,
		isBerry: true,
		onChargeMove(pokemon, target, move) {
			if (!move.flags['charge']) return;
			if (pokemon.eatItem(true)) {
				this.add('-activate', pokemon, 'item: Deep-Rooted Truffle');
				return false;
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3439,
		gen: 9,
		desc: "Lets one charging move strike on the first turn. Single use.",
	},
	shockingvinecluster: {
		name: "Shocking Vine-Cluster",
		spritenum: 0,
		isBerry: true,
		onAfterMove(source, target, move) {
			if (!move.sideCondition && !['spikes', 'stealthrock', 'stickyweb', 'toxicspikes', 'livewire'].includes(move.id)) return;
			if (source.eatItem(true)) {
				source.side.foe.addSideCondition('livewire', source, this.dex.items.get('shockingvinecluster'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3440,
		gen: 9,
		desc: "Adds a paralysing Live Wire layer to the hazards the holder sets. Single use.",
	},
	bogmosspod: {
		name: "Bog-Moss Pod",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Ground') target.eatItem();
		},
		onEat(pokemon) {
			for (const mon of this.getAllActive()) {
				if (mon.isGrounded()) this.boost({ spe: -1 }, mon, pokemon, this.dex.items.get('bogmosspod'));
			}
		},
		isNonstandard: 'Custom',
		num: 3441,
		gen: 9,
		desc: "When hit by a Ground move, every grounded Pokemon loses 1 Speed. Single use.",
	},
	glowstalktendril: {
		name: "Glow-Stalk Tendril",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (this.field.getPseudoWeather('hauntedroom')) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.boost({ accuracy: 2 }, pokemon, pokemon, this.dex.items.get('glowstalktendril'));
		},
		isNonstandard: 'Custom',
		num: 3442,
		gen: 9,
		desc: "Raises accuracy by 2 stages in a Haunted Room. Single use.",
	},
	bitteracornnut: {
		name: "Bitter Acorn-Nut",
		spritenum: 0,
		isBerry: true,
		onAfterEachBoost(boost, target, source) {
			if (!source || target.isAlly(source)) return;
			const reflected: SparseBoostsTable = {};
			let dropped = false;
			let stat: BoostID;
			for (stat in boost) {
				if (boost[stat]! < 0) {
					reflected[stat] = boost[stat];
					dropped = true;
				}
			}
			if (dropped && target.eatItem(true)) {
				this.boost(reflected, source, target, this.dex.items.get('bitteracornnut'));
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3443,
		gen: 9,
		desc: "Reflects one stat drop back onto the foe that caused it. Single use.",
	},
	sweetorchidbulb: {
		name: "Sweet Orchid-Bulb",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (this.field.isTerrain('grassyterrain')) pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.side.addSideCondition('safeguard', pokemon, this.dex.items.get('sweetorchidbulb'));
		},
		isNonstandard: 'Custom',
		num: 3444,
		gen: 9,
		desc: "In Grassy Terrain, shields the holder's side from status. Single use.",
	},
	aurabloompetals: {
		name: "Aura-Bloom Petals",
		spritenum: 0,
		isBerry: true,
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			let neutral = true;
			let stat: BoostID;
			for (stat in user.boosts) {
				if (user.boosts[stat] !== 0) neutral = false;
			}
			if (neutral) return this.chainModify(1.2);
		},
		onAfterMove(source, target, move) {
			if (move.category !== 'Status') source.eatItem(true);
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3445,
		gen: 9,
		desc: "With no stat changes, the holder's next attack deals 20% more damage.",
	},
	petrifiedwoodseed: {
		name: "Petrified Wood-Seed",
		spritenum: 0,
		isBerry: true,
		onEffectiveness(typeMod, target, type, move) {
			if (!target || move.type !== 'Flying' || typeMod <= 0) return;
			if (target.eatItem(true)) {
				this.add('-activate', target, 'item: Petrified Wood-Seed');
				return 0;
			}
		},
		onEat() {},
		isNonstandard: 'Custom',
		num: 3446,
		gen: 9,
		desc: "Neutralises one super effective Flying-type move. Single use.",
	},
	brinesproutkelp: {
		name: "Brine-Sprout Kelp",
		spritenum: 0,
		isBerry: true,
		onWeatherChange(pokemon) {
			if (['raindance', 'primordialsea'].includes(pokemon.effectiveWeather())) pokemon.eatItem();
		},
		onEat(pokemon) {
			this.boost({ evasion: 1 }, pokemon, pokemon, this.dex.items.get('brinesproutkelp'));
		},
		isNonstandard: 'Custom',
		num: 3447,
		gen: 9,
		desc: "Raises evasiveness by 1 stage in rain. Single use.",
	},
	cinderashpod: {
		name: "Cinder-Ash Pod",
		spritenum: 0,
		isBerry: true,
		onDamagingHit(damage, target, source, move) {
			if (move.type === 'Fire') target.eatItem();
		},
		onEat(pokemon) {
			this.boost({ spe: 1 }, pokemon, pokemon, this.dex.items.get('cinderashpod'));
		},
		isNonstandard: 'Custom',
		num: 3448,
		gen: 9,
		desc: "Raises Speed by 1 stage when hit by a Fire move. Single use.",
	},
	feathergrasstuft: {
		name: "Feather-Grass Tuft",
		spritenum: 0,
		isBerry: true,
		onSwitchIn(pokemon) {
			pokemon.eatItem();
		},
		onEat(pokemon) {
			pokemon.addVolatile('fakemongroundguard', pokemon, this.dex.items.get('feathergrasstuft'));
		},
		isNonstandard: 'Custom',
		num: 3449,
		gen: 9,
		desc: "On entry, the holder ignores Ground moves for 2 turns. Single use.",
	},
	midnightbrambleberry: {
		name: "Midnight Bramble-Berry",
		spritenum: 0,
		isBerry: true,
		onUpdate(pokemon) {
			if (pokemon.hp && pokemon.hp * 10 <= pokemon.maxhp * 3) pokemon.eatItem();
		},
		onEat(pokemon) {
			for (const foe of pokemon.foes()) {
				this.damage(pokemon.baseMaxhp * 0.2, foe, pokemon, this.dex.items.get('midnightbrambleberry'));
			}
		},
		isNonstandard: 'Custom',
		num: 3450,
		gen: 9,
		desc: "Below 30% HP, deals 20% of the holder's max HP to the foe. Single use.",
	},
};
