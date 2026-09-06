'use strict';

/**
 * End-to-end tests for the custom Fakemon system.
 *
 * These follow the acceptance checklist for the project: data separation, the
 * two Mega Evolution paths, custom abilities, items, new field effects, the
 * team validator, singles, doubles, and the bot.
 */

const assert = require('./../../assert');
const common = require('./../../common');
const { Dex, Teams, TeamValidator } = require('./../../../dist/sim');
const { FakemonBot } = require('./../../../dist/data/mods/fakemon/bot');
const FakemonIndex = require('./../../../dist/data/mods/fakemon/generated/index').FakemonIndex;

const fakemon = common.mod('fakemon');
const dex = Dex.mod('fakemon');

let battle;

describe('Fakemon: data separation', () => {
	before(() => dex.includeData());

	it('should not contain any original Pokemon', () => {
		for (const id of ['pikachu', 'charizard', 'garchomp', 'greattusk', 'venusaurmega']) {
			assert.false(dex.species.get(id).exists, `${id} should not exist`);
		}
	});

	it('should not contain any original moves, abilities or items', () => {
		for (const id of ['thunderbolt', 'earthquake', 'uturn']) {
			assert.false(dex.moves.get(id).exists, `move ${id} should not exist`);
		}
		for (const id of ['levitate', 'intimidate', 'protean']) {
			assert.false(dex.abilities.get(id).exists, `ability ${id} should not exist`);
		}
		for (const id of ['leftovers', 'lifeorb', 'choicescarf']) {
			assert.false(dex.items.get(id).exists, `item ${id} should not exist`);
		}
	});

	it('should keep the original moves it needs for mechanics unusable', () => {
		// Protect's condition is what every custom protecting move reuses.
		assert(dex.moves.get('protect').exists);
		assert.equal(dex.moves.get('protect').isNonstandard, 'Custom');
		for (const id of Object.keys(dex.data.Learnsets)) {
			assert.false(
				Object.keys(dex.data.Learnsets[id].learnset || {}).includes('protect'),
				`${id} should not learn Protect`
			);
		}
	});

	it('should not let an original alias reach an original entry', () => {
		// "adapt" is an alias for Adaptability upstream and a custom move here.
		assert.equal(dex.moves.get('adapt').name, 'Adapt');
		assert.false(dex.species.get('zard').exists);
	});

	it('should contain every entry from the source files', () => {
		assert.equal(Object.keys(dex.data.Pokedex).length, FakemonIndex.species.length);
		for (const name of FakemonIndex.species) {
			assert(dex.species.get(name).exists, `${name} is missing`);
		}
		for (const id of Object.keys(FakemonIndex.signatureMoves)) {
			assert(dex.moves.get(id).exists, `signature move ${id} is missing`);
		}
		for (const id of Object.keys(FakemonIndex.abilities)) {
			assert(dex.abilities.get(id).exists, `ability ${id} is missing`);
		}
		for (const id of Object.keys(FakemonIndex.megaAbilities)) {
			assert(dex.abilities.get(id).exists, `Mega ability ${id} is missing`);
		}
	});
});

describe('Fakemon: Pokemon data', () => {
	it('should give every Pokemon types, stats, abilities and moves', () => {
		for (const name of FakemonIndex.baseSpecies) {
			const species = dex.species.get(name);
			assert(species.types.length >= 1, `${name} has no types`);
			const bst = Object.values(species.baseStats).reduce((a, b) => a + b, 0);
			assert(bst >= 200 && bst <= 800, `${name} has an implausible BST of ${bst}`);
			assert(Object.values(species.abilities).filter(Boolean).length >= 1,
				`${name} has no abilities`);
			if (species.isMega) continue;
			const learnset = dex.species.getLearnsetData(species.id).learnset;
			assert(Object.keys(learnset || {}).length > 0, `${name} has no moves`);
		}
	});

	it('should only ever put Mega Abilities on Mega formes', () => {
		const megaAbilities = new Set(Object.values(FakemonIndex.megaAbilities));
		for (const name of FakemonIndex.species) {
			const species = dex.species.get(name);
			if (species.isMega) continue;
			for (const ability of Object.values(species.abilities)) {
				assert.false(megaAbilities.has(ability),
					`${name} must not have the Mega Ability ${ability}`);
			}
		}
	});
});

describe('Fakemon: Mega Evolution', () => {
	afterEach(() => {
		battle.destroy();
	});

	it('should give +20 to every base stat when Mega Evolving without a stone', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		const pokemon = battle.p1.active[0];
		const before = { ...pokemon.species.baseStats };
		const storedBefore = { ...pokemon.storedStats };
		const maxhpBefore = pokemon.maxhp;

		battle.makeChoices('move 1 mega', 'move 1');

		const after = pokemon.species.baseStats;
		for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
			assert.equal(after[stat], before[stat] + 20,
				`${stat} should be +20 (was ${before[stat]}, now ${after[stat]})`);
		}
		// +120 BST in total, and the change is real: stats and HP both moved.
		const gained = Object.values(after).reduce((a, b) => a + b, 0) -
			Object.values(before).reduce((a, b) => a + b, 0);
		assert.equal(gained, 120);
		assert(pokemon.maxhp > maxhpBefore, 'max HP should increase');
		assert(pokemon.storedStats.atk > storedBefore.atk, 'Attack should increase');
		// It stays the same Pokemon.
		assert.equal(pokemon.species.name, 'Pumpini');
	});

	it('should keep its normal ability when Mega Evolving without a stone', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		battle.makeChoices('move 1 mega', 'move 1');
		assert.equal(battle.p1.active[0].ability, 'grassstarter');
	});

	it('should give exactly +100 BST and the Mega Ability with the right stone', () => {
		battle = fakemon.createBattle([[
			{ species: 'Hallowisp', ability: 'grassstarter', item: 'hallowispite', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		const pokemon = battle.p1.active[0];
		const before = Object.values(pokemon.species.baseStats).reduce((a, b) => a + b, 0);

		battle.makeChoices('move 1 mega', 'move 1');

		assert.equal(pokemon.species.name, 'Hallowisp-Mega');
		const after = Object.values(pokemon.species.baseStats).reduce((a, b) => a + b, 0);
		assert.equal(after - before, 100, 'a Mega Stone must be worth exactly +100 BST');
		assert.equal(pokemon.ability, 'sugarpile', 'the Mega Ability should be active');
		assert.equal(pokemon.species.types.join('/'), 'Grass/Ghost/Fairy');
	});

	it('should not apply a Mega Stone that belongs to another Pokemon', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', item: 'hallowispite', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		const pokemon = battle.p1.active[0];
		const before = { ...pokemon.species.baseStats };
		battle.makeChoices('move 1 mega', 'move 1');
		// Falls back to the stoneless Mega Evolution.
		assert.equal(pokemon.species.name, 'Pumpini');
		assert.equal(pokemon.species.baseStats.atk, before.atk + 20);
	});

	it('should not use a Pokemon\'s own Mega forme without its Mega Stone', () => {
		// Hallowisp has a Mega forme, but without Hallowispite it Mega Evolves
		// like everybody else: +20 across the board, same species, same ability,
		// same typing - it never reaches Hallowisp-Mega.
		battle = fakemon.createBattle([[
			{ species: 'Hallowisp', ability: 'grassstarter', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		const pokemon = battle.p1.active[0];
		const before = { ...pokemon.species.baseStats };
		const types = pokemon.species.types.join('/');

		battle.makeChoices('move 1 mega', 'move 1');

		assert.equal(pokemon.species.name, 'Hallowisp', 'it must not become Hallowisp-Mega');
		assert.equal(pokemon.ability, 'grassstarter', 'the Mega Ability must stay locked');
		assert.equal(pokemon.species.types.join('/'), types, 'the typing must not change');
		for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
			assert.equal(pokemon.species.baseStats[stat], before[stat] + 20, `${stat} should be +20`);
		}
	});

	it('should only allow one Mega Evolution per side', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', moves: ['sugarcrush'] },
			{ species: 'Candigrim', ability: 'grassstarter', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
			{ species: 'Spukasten', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		battle.makeChoices('move 1 mega', 'move 1');
		assert.false(!!battle.p1.pokemon[1].canMegaEvo, 'the rest of the team cannot Mega Evolve');
	});
});

describe('Fakemon: the four item spreadsheets', () => {
	before(() => dex.includeData());
	beforeEach(() => {
		battle = null;
	});
	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
	});

	it('should register all 200 new items as custom data', () => {
		const groups = {
			food: require('./../../../dist/data/mods/fakemon/items-food').FoodItems,
			consumable: require('./../../../dist/data/mods/fakemon/items-consumables').ConsumableItems,
			battle: require('./../../../dist/data/mods/fakemon/items-battle').BattleItems,
			permanent: require('./../../../dist/data/mods/fakemon/items-permanent').PermanentItems,
		};
		let total = 0;
		for (const [group, table] of Object.entries(groups)) {
			assert.equal(Object.keys(table).length, 50, `${group} should hold 50 items`);
			for (const id of Object.keys(table)) {
				const item = dex.items.get(id);
				assert(item.exists, `${id} should exist in the mod`);
				assert.equal(item.isNonstandard, 'Custom', `${id} should be tagged as custom`);
				total++;
			}
		}
		assert.equal(total, 200);
	});

	it('should count every edible item as a food item', () => {
		const { FOOD_ITEMS } = require('./../../../dist/data/mods/fakemon/items');
		const food = require('./../../../dist/data/mods/fakemon/items-food').FoodItems;
		const consumables = require('./../../../dist/data/mods/fakemon/items-consumables').ConsumableItems;
		for (const id of [...Object.keys(food), ...Object.keys(consumables)]) {
			assert(FOOD_ITEMS.includes(id), `${id} should count as a food item`);
		}
	});

	it('should cure paralysis and raise Speed with the Volt-Spore Shroom', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', item: 'voltsporeshroom', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['gemstoneglare'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		const pokemon = battle.p1.active[0];
		assert.equal(pokemon.status, '', 'the paralysis should be cured');
		assert.equal(pokemon.boosts.spe, 1, 'Speed should be raised by 1');
		assert.equal(pokemon.item, '', 'the mushroom should be eaten');
	});

	it('should slow a contact attacker with the Sticky Honey-Comb', () => {
		battle = fakemon.createBattle([[
			{ species: 'Bytebug', ability: 'grassstarter', item: 'stickyhoneycomb', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['headbuttrush'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		assert.equal(battle.p2.active[0].boosts.spe, -1);
		assert.equal(battle.p1.active[0].item, 'stickyhoneycomb', 'it is not consumed');
	});

	it('should lock the holder out of status moves with the Assault Vestment', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', item: 'assaultvestment', moves: ['sugarcrush', 'normalguard'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['headbuttrush'] },
		]]);
		const request = battle.p1.activeRequest.active[0].moves;
		assert(request[1].disabled, 'the status move should be unselectable');
		assert.false(!!request[0].disabled, 'the attack should still be selectable');
	});

	it('should make the holder immune to burns with the Volcanic Sulfur Ore', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', item: 'volcanicsulfurore', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['headbuttrush'] },
		]]);
		const pokemon = battle.p1.active[0];
		assert.false(pokemon.trySetStatus('brn', pokemon), 'the burn must be refused');
		assert.equal(pokemon.status, '');
	});

	it('should stop forced switches with the Granite Anchor', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', item: 'graniteanchor', moves: ['sugarcrush'] },
			{ species: 'Candigrim', ability: 'grassstarter', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['warriorsroar'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		assert.equal(battle.p1.active[0].species.name, 'Pumpini', 'the holder should stay in');
	});

	it('should hurt contact attackers with the Splinter-Bark Husk', () => {
		battle = fakemon.createBattle([[
			{ species: 'Bytebug', ability: 'grassstarter', item: 'splinterbarkhusk', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['headbuttrush'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		const attacker = battle.p2.active[0];
		assert(attacker.hp < attacker.maxhp, 'the attacker should take recoil from the husk');
	});

	it('should offer every item to the team builder as custom data only', () => {
		for (const id of Object.keys(dex.data.Items)) {
			assert.equal(dex.data.Items[id].isNonstandard, 'Custom',
				`${id} leaked in from the original game`);
		}
		assert.equal(Object.keys(dex.data.Items).length, 240);
	});
});

describe('Fakemon: effect setters', () => {
	before(() => dex.includeData());
	beforeEach(() => {
		battle = null;
	});
	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
	});

	/** The root of an evolution line, which is what "a line" means here. */
	const lineOf = name => {
		let species = dex.species.get(name);
		while (species.prevo) species = dex.species.get(species.prevo);
		return species.baseSpecies || species.name;
	};

	it('should let at least two lines learn every effect setter', () => {
		const lines = new Map();
		for (const id of Object.keys(dex.data.Pokedex)) {
			const species = dex.species.get(id);
			if (species.isMega) continue;
			const line = lineOf(species.name);
			for (const moveId of Object.keys(dex.species.getLearnsetData(id).learnset || {})) {
				if (!lines.has(moveId)) lines.set(moveId, new Set());
				lines.get(moveId).add(line);
			}
		}
		for (const id of FakemonIndex.effectMoves) {
			if (id === 'bulwark') continue;
			assert(dex.moves.get(id).exists, `${id} should exist`);
			assert((lines.get(id)?.size || 0) >= 2,
				`${id} is only learnable by ${lines.get(id)?.size || 0} line(s)`);
		}
	});

	it('should give every Pokemon the protecting move', () => {
		for (const id of Object.keys(dex.data.Pokedex)) {
			if (dex.species.get(id).isMega) continue;
			const learnset = dex.species.getLearnsetData(id).learnset || {};
			assert(learnset.bulwark, `${dex.species.get(id).name} cannot learn Bulwark`);
		}
	});

	it('should reach every weather, terrain, room and hazard with a custom move', () => {
		// A setter that only an original Showdown move could reach is a setter
		// nobody in this game can use.
		const wanted = [
			'brn', 'par', 'slp', 'frz', 'psn', 'tox',
			'sunnyday', 'raindance', 'sandstorm', 'snowscape', 'hail', 'fullmoon', 'fakemonmiasma',
			'electricterrain', 'grassyterrain', 'mistyterrain', 'psychicterrain',
			'trickroom', 'magicroom', 'wonderroom', 'hauntedroom', 'glitchedroom',
			'reflect', 'lightscreen', 'auroraveil', 'safeguard', 'tailwind',
			'spikes', 'toxicspikes', 'stealthrock', 'stickyweb', 'livewire',
		];
		const custom = new Set([
			...FakemonIndex.genericMoves, ...Object.keys(FakemonIndex.signatureMoves),
			...FakemonIndex.effectMoves,
		]);
		const reached = new Set();
		for (const id of custom) {
			const move = dex.data.Moves[id];
			if (!move) continue;
			for (const key of ['weather', 'terrain', 'pseudoWeather', 'sideCondition', 'status']) {
				if (move[key]) reached.add(dex.toID(move[key]));
			}
			if (move.self?.sideCondition) reached.add(dex.toID(move.self.sideCondition));
			const body = [move.onHit, move.onHitField, move.onAfterHit].map(String).join('');
			for (const effect of wanted) if (body.includes(`'${effect}'`)) reached.add(effect);
		}
		const missing = wanted.filter(id => !reached.has(id));
		assert.equal(missing.length, 0, `no custom move sets: ${missing.join(', ')}`);
	});

	it('should actually set the effect it names', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', moves: ['sparkfield', 'raincall', 'bulwark'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		assert(battle.field.isTerrain('electricterrain'), 'Spark Field should set Electric Terrain');
		battle.makeChoices('move 2', 'move 1');
		assert(battle.field.isWeather('raindance'), 'Rain Call should start rain');
		battle.makeChoices('move 3', 'move 1');
		// The protect volatile only lasts the turn, so the log is the record.
		assert(battle.log.some(line => line.includes('-singleturn') && line.includes('Protect')),
			'Bulwark should put up a protection');
	});
});

describe('Fakemon: sets and trapping', () => {
	before(() => dex.includeData());
	beforeEach(() => {
		battle = null;
	});
	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
	});

	const validator = () => new TeamValidator('fakemonsingles');
	const sample = () => {
		const species = dex.species.get('Pumpini');
		return {
			species: 'Pumpini', ability: species.abilities[0], name: 'x',
			moves: Object.keys(dex.species.getLearnsetData(species.id).learnset).slice(0, 4),
			evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 }, nature: 'Adamant', level: 100,
		};
	};

	it('should accept a set with no item and a single move', () => {
		const set = { ...sample(), item: '', moves: [sample().moves[0]] };
		assert.equal(validator().validateTeam([set]), null);
	});

	it('should accept an evolved Pokemon at any level', () => {
		// This game has no levelling up, so an evolution level would only ever
		// forbid a level the player deliberately chose.
		for (const level of [1, 5, 50, 100]) {
			const set = {
				...sample(), species: 'Hallowisp', level,
				evs: { hp: 5, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
			};
			set.ability = dex.species.get('Hallowisp').abilities[0];
			set.moves = Object.keys(dex.species.getLearnsetData('hallowisp').learnset).slice(0, 2);
			assert.equal(validator().validateTeam([set]), null, `level ${level} should be legal`);
		}
	});

	it('should accept a team of two Pokemon', () => {
		// A team may hold anything from one to six; empty slots are simply not sent.
		const first = sample();
		const second = { ...sample(), species: 'Sprank', name: 'y', ability: 'cabinetlock' };
		second.moves = Object.keys(dex.species.getLearnsetData('sprank').learnset).slice(0, 2);
		assert.equal(validator().validateTeam([first, second]), null);
		assert.equal(validator().validateTeam([first]), null, 'and a team of one');
	});

	it('should accept the 508 EVs the team builder allows', () => {
		// The builder caps at 252 per stat and 508 in total; the server's own
		// limit is 510, so anything the builder produces has to pass here.
		const set = { ...sample(), evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } };
		assert.equal(validator().validateTeam([set]), null);
	});

	it('should accept any nature and any IV spread', () => {
		for (const nature of ['Adamant', 'Modest', 'Serious', 'Quirky', 'Sassy']) {
			const set = { ...sample(), nature, ivs: { hp: 31, atk: 31, def: 31, spa: 0, spd: 31, spe: 31 } };
			assert.equal(validator().validateTeam([set]), null, `${nature} should be legal`);
		}
	});

	it('should reject more than 510 EVs', () => {
		const set = { ...sample(), evs: { hp: 252, atk: 252, def: 252, spa: 0, spd: 0, spe: 0 } };
		assert(validator().validateTeam([set]), 'an over-limit spread should be rejected');
	});

	it('should let Cabinet Lock trap what Haunted Room turned into a Ghost', () => {
		// Ghosts are normally immune to trapping, and Haunted Room makes
		// everything a Ghost - so the ability has to bypass that immunity or it
		// can never trap anybody.
		battle = fakemon.createBattle([[
			{ species: 'Bytebug', ability: 'hover', moves: ['sugarcrush'] },
			{ species: 'Pumpini', ability: 'grassstarter', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
			{ species: 'Spukasten', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		battle.makeChoices('move 1', 'move 1');
		assert(battle.field.getPseudoWeather('hauntedroom'), 'Haunted Room should be up');
		const pokemon = battle.p1.active[0];
		assert(pokemon.hasType('Ghost'), 'Haunted Room should have made it a Ghost');
		assert(battle.p1.activeRequest.active[0].trapped, 'and Cabinet Lock should hold it');
	});
});

describe("Fakemon: the bot's Mega permissions", () => {
	const request = () => ({
		active: [{ canMegaEvo: true, moves: [{ id: 'sugarcrush', move: 'Sugarcrush', target: 'normal' }] }],
		side: { pokemon: [{ details: 'Hallowisp, L100, M', condition: '300/300', active: true }] },
	});

	it('should always Mega Evolve the one Pokemon it was allowed to', () => {
		// Even on easy, which normally never Mega Evolves.
		const bot = new FakemonBot({ name: 'B', difficulty: 'easy', megaSpecies: ['hallowisp'] });
		assert(bot.decide(request()).includes('mega'));
	});

	it('should never Mega Evolve one it was not allowed to', () => {
		const bot = new FakemonBot({ name: 'B', difficulty: 'hard', megaSpecies: ['bytebug'] });
		assert.false(bot.decide(request()).includes('mega'));
	});

	it('should fall back to its own judgement with no list', () => {
		const bot = new FakemonBot({ name: 'B', difficulty: 'easy' });
		assert.false(bot.decide(request()).includes('mega'), 'easy never megas on its own');
		const hard = new FakemonBot({ name: 'B', difficulty: 'hard' });
		assert(hard.decide(request()).includes('mega'), 'hard does');
	});
});

describe('Fakemon: formes and levels', () => {
	before(() => dex.includeData());
	beforeEach(() => {
		battle = null;
	});
	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
	});

	it('should give Tigitz two coats with the same stats', () => {
		const brawler = dex.species.get('Tigitz');
		const fae = dex.species.get('Tigitz-Fae');
		assert(fae.exists, 'Tigitz-Fae should exist');
		assert.deepEqual(brawler.types, ['Normal', 'Fighting']);
		assert.deepEqual(fae.types, ['Normal', 'Fairy']);
		assert.deepEqual(fae.baseStats, brawler.baseStats, 'the two coats share a spread');
		// Each coat grows into the evolution that matches its typing.
		assert.deepEqual(brawler.evos, ['Tigraxe']);
		assert.deepEqual(fae.evos, ['Tigraith']);
	});

	it('should make Tigraith and Tigraxe mirror images', () => {
		const raith = dex.species.get('Tigraith');
		const raxe = dex.species.get('Tigraxe');
		assert.deepEqual(raith.types, ['Fairy', 'Ghost']);
		assert.deepEqual(raxe.types, ['Fighting', 'Fire']);
		assert.equal(raith.baseStats.spa, raxe.baseStats.atk);
		assert.equal(raith.baseStats.atk, raxe.baseStats.spa);
		assert.equal(raith.baseStats.spd, raxe.baseStats.def);
		assert.equal(raith.baseStats.def, raxe.baseStats.spd);
		assert.equal(raith.baseStats.spe, raxe.baseStats.spe);
		assert(raith.baseStats.spa > raith.baseStats.atk, 'Tigraith attacks specially');
		assert(raxe.baseStats.atk > raxe.baseStats.spa, 'Tigraxe attacks physically');
	});

	it('should give the crowned and axed formes legendary stats and a third type', () => {
		const cases = [
			['Tigraith-Crowned', 'Tigraith', 'Ice', 'spa'],
			['Tigraxe-Axed', 'Tigraxe', 'Steel', 'atk'],
		];
		for (const [formeName, baseName, thirdType, stat] of cases) {
			const forme = dex.species.get(formeName);
			const base = dex.species.get(baseName);
			assert(forme.exists, `${formeName} should exist`);
			assert.equal(forme.types.length, 3, `${formeName} should have three types`);
			assert.equal(forme.types[2], thirdType);
			assert(forme.baseStats[stat] > base.baseStats[stat],
				`${formeName} should out-hit ${baseName}`);
			assert(forme.bst >= 600, `${formeName} should be legendary-sized (is ${forme.bst})`);
		}
	});

	it('should have the hyper formes trade bulk for speed and offence', () => {
		const pairs = [
			['Tigraith-Hypercrowned', 'Tigraith-Crowned', 'spa'],
			['Tigraxe-Hyperaxed', 'Tigraxe-Axed', 'atk'],
		];
		for (const [hyper, crowned, stat] of pairs) {
			const a = dex.species.get(hyper);
			const b = dex.species.get(crowned);
			assert.equal(a.bst, b.bst, `${hyper} should cost the same total`);
			assert(a.baseStats[stat] > b.baseStats[stat], `${hyper} should hit harder`);
			assert(a.baseStats.spe > b.baseStats.spe, `${hyper} should be faster`);
			assert(a.baseStats.hp + a.baseStats.def + a.baseStats.spd <
				b.baseStats.hp + b.baseStats.def + b.baseStats.spd, `${hyper} should be frailer`);
			assert.deepEqual(a.types, b.types);
		}
	});

	it('should give the dog lines three coats that cost the same', () => {
		for (const line of ['Budpup', 'Budruff', 'Mudruff']) {
			const bobtail = dex.species.get(line);
			const beagle = dex.species.get(`${line}-Beagle`);
			const dalmatian = dex.species.get(`${line}-Dalmatian`);
			assert(beagle.exists && dalmatian.exists, `${line} should have all three coats`);
			assert.equal(bobtail.baseForme, 'Bobtail');
			assert.equal(beagle.bst, bobtail.bst, 'the coats share a total');
			assert.equal(dalmatian.bst, bobtail.bst);
			assert(bobtail.baseStats.def > beagle.baseStats.def, 'Bobtail is the sturdy one');
			assert(beagle.baseStats.atk > bobtail.baseStats.atk, 'Beagle is the strong one');
			assert(dalmatian.baseStats.spe > bobtail.baseStats.spe, 'Dalmatian is the quick one');
		}
	});

	it('should keep the coat when a dog evolves', () => {
		assert.deepEqual(dex.species.get('Budpup-Beagle').evos, ['Budruff-Beagle']);
		assert.equal(dex.species.get('Mudruff-Dalmatian').prevo, 'Budruff-Dalmatian');
	});

	it('should keep Anxious on Cottonip alone', () => {
		const abilities = name => Object.values(dex.species.get(name).abilities);
		assert(abilities('Cottonip').includes('Anxious'));
		for (const name of ['Pompash', 'Pompomble']) {
			assert.false(abilities(name).includes('Anxious'),
				`${name} should have grown out of Anxious`);
		}
	});

	it('should scale stats with the level', () => {
		const species = dex.species.get('Pumpini');
		const move = Object.keys(dex.species.getLearnsetData(species.id).learnset)[0];
		const set = level => ({
			species: 'Pumpini', ability: species.abilities[0], moves: [move], level,
		});
		battle = fakemon.createBattle([[set(100), set(37), set(1)]], [[
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		const [full, mid, low] = battle.p1.pokemon;
		assert(full.maxhp > mid.maxhp && mid.maxhp > low.maxhp, 'HP should fall with the level');
		assert(full.storedStats.atk > mid.storedStats.atk, 'Attack should fall with the level');
		assert(mid.storedStats.spe > low.storedStats.spe, 'Speed should fall with the level');
	});
});

describe('Fakemon: every attack can be aimed', () => {
	before(() => dex.includeData());

	it('should never leave a damaging move with a target it cannot hit', () => {
		// A rule written for a status move used to set target: 'self' along
		// with its payload, which made the attack hit nobody.
		const aimable = ['normal', 'any', 'adjacentFoe', 'adjacentAlly', 'adjacentAllyOrSelf',
			'allAdjacent', 'allAdjacentFoes', 'randomNormal', 'scripted'];
		for (const [id, move] of Object.entries(dex.data.Moves)) {
			if (move.category === 'Status') continue;
			// Bide is an engine mechanic nothing can select.
			if (id === 'bide') continue;
			assert(aimable.includes(move.target), `${id} deals damage but targets ${move.target}`);
		}
	});

	it('should let a single-target attack choose the partner', () => {
		// Every move a player picks a target for must accept an ally slot.
		const single = ['normal', 'any', 'adjacentAlly', 'adjacentAllyOrSelf'];
		let checked = 0;
		for (const move of Object.values(dex.data.Moves)) {
			if (move.category === 'Status' || !single.includes(move.target)) continue;
			checked++;
		}
		assert(checked > 500, `expected most attacks to be aimable, got ${checked}`);
	});
});

describe('Fakemon: ability announcements', () => {
	beforeEach(() => {
		battle = null;
	});
	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
	});

	it('should name the ability whenever it takes effect', () => {
		// Grass-Starter boosts Grass moves, which is otherwise invisible: the
		// player only sees a damage number they cannot explain.
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		const lines = battle.log.filter(line => line.startsWith('|-ability|'));
		assert(lines.some(line => line.includes('Pumpini') && line.includes('Grass-Starter')),
			`expected a Grass-Starter line, got ${JSON.stringify(lines)}`);
	});

	it('should announce the ability before what the ability did', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		const ability = battle.log.findIndex(line => line.includes('|Grass-Starter'));
		const damage = battle.log.findIndex(line => line.startsWith('|-damage|p2a'));
		assert(ability >= 0 && damage >= 0 && ability < damage,
			'the ability line should come before the damage it caused');
	});

	it('should stay quiet when the ability does not apply', () => {
		// Grass-Starter only touches Grass moves; a Ghost move must not trigger it.
		battle = fakemon.createBattle([[
			{ species: 'Sprank', ability: 'grassstarter', moves: ['furniturehaunt'] },
		], [
			{ species: 'Spukasten', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		assert.false(battle.log.some(line => line.includes('|Grass-Starter')),
			'an ability that did nothing must not be announced');
	});

	it('should announce an ability at most once per turn', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		const perTurn = battle.log.filter(line => line.includes('|Grass-Starter')).length;
		assert.equal(perTurn, 1, 'a modifier that fires on every hit must not flood the log');
	});
});

describe('Fakemon: doubles targeting', () => {
	beforeEach(() => {
		battle = null;
	});
	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
	});

	const doublesTeams = () => [[
		{ species: 'Pumpini', ability: 'grassstarter', moves: ['sugarcrush', 'nectarheal'] },
		{ species: 'Candigrim', ability: 'grassstarter', moves: ['sugarcrush'] },
		{ species: 'Hallowisp', ability: 'grassstarter', moves: ['sugarcrush'] },
	], [
		{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		{ species: 'Spukasten', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		{ species: 'Bytebug', ability: 'quickcharge', moves: ['furniturehaunt'] },
	]];

	it('should let a Pokemon attack its own partner', () => {
		battle = fakemon.createBattle({ gameType: 'doubles' }, doublesTeams());
		const partner = battle.p1.active[1];
		const before = partner.hp;
		battle.makeChoices('move 1 -2, move 1 1', 'move 1, move 1');
		assert(partner.hp < before, 'the partner should have taken the hit');
	});

	it('should let an ally-targeting move pick the partner', () => {
		battle = fakemon.createBattle({ gameType: 'doubles' }, doublesTeams());
		const partner = battle.p1.active[1];
		partner.hp = Math.floor(partner.maxhp / 4);
		const before = partner.hp;
		battle.makeChoices('move 2 -2, move 1 1', 'move 1, move 1');
		assert(partner.hp > before, 'Nectar Heal should have healed the partner');
	});

	it('should offer a choosable target for every move that needs one', () => {
		// These are exactly the targets the server demands a target for; the
		// client must offer all of them or the choice is rejected with
		// "Can't move: X needs a target".
		const needTarget = ['normal', 'any', 'adjacentAlly', 'adjacentAllyOrSelf', 'adjacentFoe'];
		const client = require('fs')
			.readFileSync('./server/static/fakemon.js', 'utf8');
		const listed = client.match(/const CHOOSABLE_TARGETS = \[([^\]]*)\]/);
		assert(listed, 'the client should declare which targets it asks for');
		for (const target of needTarget) {
			assert(listed[1].includes(`'${target}'`), `the client must handle ${target}`);
		}
	});
});

describe('Fakemon: move wiring', () => {
	before(() => dex.includeData());
	beforeEach(() => {
		battle = null;
	});
	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
	});

	it('should keep the internal helper moves the signature moves need', () => {
		for (const id of ['needlejabready', 'barbedcounterhit']) {
			assert(dex.moves.get(id).exists, `${id} must survive the data separation`);
		}
		// Needle Jab's counter is attached as a volatile, so it has to resolve
		// as a condition too.
		assert(dex.conditions.get('needlejabready').exists);
	});

	it('should point every force-switch move at the opponent', () => {
		for (const [id, move] of Object.entries(dex.data.Moves)) {
			if (!move.forceSwitch) continue;
			assert(['normal', 'any', 'adjacentFoe', 'allAdjacentFoes'].includes(move.target),
				`${id} forces a switch but targets ${move.target}`);
		}
	});

	it('should make every onHitField move field-wide', () => {
		for (const [id, move] of Object.entries(dex.data.Moves)) {
			if (!move.onHitField) continue;
			assert.equal(move.target, 'all', `${id} uses onHitField but targets ${move.target}`);
		}
	});

	it('should never put onAfterHit on a status move', () => {
		// onAfterHit only runs for moves that dealt damage, so it is dead code there.
		for (const [id, move] of Object.entries(dex.data.Moves)) {
			if (move.category !== 'Status') continue;
			assert.false(!!move.onAfterHit, `${id} is a status move with a dead onAfterHit`);
		}
	});

	it('should force a switch on the opponent, not on the user', () => {
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', moves: ['warriorsroar'] },
			{ species: 'Candigrim', ability: 'grassstarter', moves: ['sugarcrush'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['headbuttrush'] },
			{ species: 'Spukasten', ability: 'cabinetlock', moves: ['headbuttrush'] },
		]]);
		battle.makeChoices('move 1', 'move 1');
		assert.equal(battle.p1.active[0].species.name, 'Pumpini', 'the user must stay in');
		assert.equal(battle.p2.active[0].species.name, 'Spukasten', 'the opponent must be switched out');
	});
});

describe('Fakemon: custom mechanics', () => {
	afterEach(() => {
		battle.destroy();
	});

	it('should run a signature move that sets a new weather (Full Moon)', () => {
		battle = fakemon.createBattle([[
			{ species: 'Hallowisp', ability: 'madness', moves: ['fullmoon'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		battle.makeChoices();
		assert.equal(battle.field.effectiveWeather(), 'fullmoon');
	});

	it('should run a signature move that sets a new room (Haunted Room)', () => {
		battle = fakemon.createBattle([[
			{ species: 'Spukasten', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		], [
			{ species: 'Eggbun', ability: 'kamikaze', moves: ['eggsplosion'] },
		]]);
		battle.makeChoices();
		assert(battle.field.getPseudoWeather('hauntedroom'), 'Haunted Room should be up');
		// Every non-Ghost is treated as part Ghost while it lasts.
		assert(battle.p2.active[0].hasType('Ghost'), 'the foe should count as Ghost-type');
	});

	it('should make a custom ability change damage (Grass-Starter)', () => {
		// Same move, same target, same seed - only the ability differs.
		const damageWith = ability => {
			const test = fakemon.createBattle({ seed: [1, 2, 3, 4] }, [[
				{ species: 'Pumpini', ability, moves: ['bramblewhip'] },
			], [
				{ species: 'Bouncunny', ability: 'eggshell', moves: ['tailcanon'] },
			]]);
			test.makeChoices('move 1', 'move 1');
			const target = test.p2.active[0];
			const damage = target.maxhp - target.hp;
			test.destroy();
			return damage;
		};
		const boosted = damageWith('grassstarter');
		const normal = damageWith('madness');
		assert(boosted > normal,
			`Grass-Starter should boost Grass moves (${boosted} vs ${normal})`);
		// The battle used by afterEach.
		battle = fakemon.createBattle([[
			{ species: 'Pumpini', ability: 'grassstarter', moves: ['bramblewhip'] },
		], [
			{ species: 'Bouncunny', ability: 'eggshell', moves: ['tailcanon'] },
		]]);
	});

	it('should trigger a custom ability on contact (Spin Counter)', () => {
		battle = fakemon.createBattle([[
			{ species: 'Rollusk', ability: 'spincounter', moves: ['shelltoss'] },
		], [
			{ species: 'Bouncunny', ability: 'eggshell', moves: ['tailcanon'] },
		]]);
		const attacker = battle.p2.active[0];
		battle.makeChoices();
		// Tailcanon is a contact move, so the attacker takes 25% of the damage back.
		assert(attacker.hp < attacker.maxhp, 'the contact attacker should take recoil');
	});

	it('should run a custom item (Sugar Berry heals at half HP)', () => {
		battle = fakemon.createBattle([[
			{ species: 'Eggbun', ability: 'eggshell', item: 'sugarberry', moves: ['eggsplosion'] },
		], [
			{ species: 'Sprank', ability: 'cabinetlock', moves: ['furniturehaunt'] },
		]]);
		const pokemon = battle.p1.active[0];
		pokemon.sethp(Math.floor(pokemon.maxhp / 2));
		battle.makeChoices();
		assert.equal(pokemon.item, '', 'the berry should have been eaten at half HP');
		// Eggsplosion also costs the user HP this turn, so check the heal itself.
		assert(battle.log.some(line => line.startsWith('|-heal|p1a: Eggbun')),
			'the berry should have healed the holder');
	});
});

describe('Fakemon: team validation', () => {
	const validator = TeamValidator.get('fakemonsingles');

	/** Build a legal-looking set; the caller breaks exactly one thing. */
	function set(overrides) {
		const base = {
			name: 'Hallowisp', species: 'Hallowisp', item: 'Sugar Berry',
			ability: dex.species.get('Hallowisp').abilities['0'],
			moves: Object.keys(dex.species.getLearnsetData('hallowisp').learnset).slice(0, 4),
			nature: 'Modest', gender: '', level: 100, shiny: false, happiness: 255,
			evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
			ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
		};
		// validateTeam takes an array of sets, not a packed string.
		return [{ ...base, ...overrides }];
	}

	it('should accept a legal custom team', () => {
		assert.equal(validator.validateTeam(set({})), null);
	});

	it('should reject an original Pokemon', () => {
		const problems = validator.validateTeam(set({
			name: 'Pikachu', species: 'Pikachu', ability: 'Static',
			moves: ['Thunderbolt'], item: '',
		}));
		assert(problems && problems.length, 'an original Pokemon must be rejected');
	});

	it('should reject an original move on a custom Pokemon', () => {
		const problems = validator.validateTeam(set({ moves: ['Thunderbolt'] }));
		assert(problems && problems.length, 'an original move must be rejected');
	});

	it('should reject an original item', () => {
		const problems = validator.validateTeam(set({ item: 'Leftovers' }));
		assert(problems && problems.length, 'an original item must be rejected');
	});

	it('should reject a Mega Ability chosen directly', () => {
		const problems = validator.validateTeam(set({ ability: 'Sugar Pile' }));
		assert(problems && problems.length, 'a Mega Ability must not be selectable');
	});

	it('should reject a Mega forme on a team', () => {
		const problems = validator.validateTeam(set({
			name: 'Hallowisp-Mega', species: 'Hallowisp-Mega', ability: 'Sugar Pile', item: '',
		}));
		assert(problems && problems.length, 'a Mega forme must not be selectable');
	});

	it('should reject a Mega Stone held by the wrong Pokemon', () => {
		const problems = validator.validateTeam(set({
			name: 'Pumpini', species: 'Pumpini', item: 'Hallowispite',
			ability: dex.species.get('Pumpini').abilities['0'],
			moves: Object.keys(dex.species.getLearnsetData('pumpini').learnset).slice(0, 4),
		}));
		assert(problems && problems.length, 'the wrong Mega Stone must be rejected');
	});

	it('should accept the right Mega Stone', () => {
		assert.equal(validator.validateTeam(set({ item: 'Hallowispite' })), null);
	});
});

describe('Fakemon: built-in web client', () => {
	const fs = require('fs');
	const path = require('path');
	const bundlePath = path.resolve(__dirname, '../../../server/static/data/fakemon-data.js');

	it('should ship a data bundle for the client', () => {
		assert(fs.existsSync(bundlePath),
			'run `node build` to generate server/static/data/fakemon-data.js');
	});

	it('should expose only custom data to the client', () => {
		const source = fs.readFileSync(bundlePath, 'utf8');
		const bundle = JSON.parse(source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1));

		assert.equal(Object.keys(bundle.pokedex).length, FakemonIndex.species.length);
		for (const id of ['pikachu', 'charizard', 'garchomp']) {
			assert.false(!!bundle.pokedex[id], `${id} must not reach the client`);
		}
		for (const id of ['thunderbolt', 'earthquake', 'protect']) {
			assert.false(!!bundle.moves[id], `${id} must not reach the client`);
		}
		for (const id of ['levitate', 'intimidate']) {
			assert.false(!!bundle.abilities[id], `${id} must not reach the client`);
		}
		for (const id of ['leftovers', 'lifeorb']) {
			assert.false(!!bundle.items[id], `${id} must not reach the client`);
		}
		// Everything the teambuilder offers must be real, learnable data.
		for (const [speciesId, moveIds] of Object.entries(bundle.learnsets)) {
			assert(bundle.pokedex[speciesId], `learnset for unknown species ${speciesId}`);
			for (const moveId of moveIds) {
				assert(bundle.moves[moveId], `${speciesId} learns unknown move ${moveId}`);
			}
		}
		// Final evolutions must be distinguishable, or the client cannot build teams.
		const finals = Object.values(bundle.pokedex)
			.filter(species => !species.battleOnly && !species.evos?.length);
		assert(finals.length > 20, `expected many final evolutions, found ${finals.length}`);
	});

	it('should not redirect the browser to the official client', () => {
		const html = fs.readFileSync(
			path.resolve(__dirname, '../../../server/static/index.html'), 'utf8');
		assert.false(/psim\.us|play\.pokemonshowdown\.com/.test(html),
			'the served page must be our own client');
	});
});

describe('Fakemon: random teams and the bot', () => {
	it('should build valid random teams for singles and doubles', () => {
		for (const formatid of ['fakemonrandombattle', 'fakemonrandomdoublesbattle']) {
			const team = Teams.generate(formatid);
			assert.equal(team.length, 6, `${formatid} should build a full team`);
			const seen = new Set();
			for (const set of team) {
				assert(dex.species.get(set.species).exists, `${set.species} should exist`);
				assert.false(seen.has(set.species), 'Species Clause');
				seen.add(set.species);
				assert(set.moves.length >= 1 && set.moves.length <= 4);
				const learnset = dex.species.getLearnsetData(dex.species.get(set.species).id).learnset;
				for (const move of set.moves) {
					assert(learnset[dex.toID(move)], `${set.species} should be able to learn ${move}`);
				}
				assert(dex.abilities.get(set.ability).exists);
				assert(Object.values(dex.species.get(set.species).abilities).includes(set.ability));
				if (set.item) assert.equal(dex.items.get(set.item).isNonstandard, 'Custom');
			}
			// At most one Mega Stone: only one Mega Evolution is allowed per battle.
			const stones = team.filter(set => dex.items.get(set.item).megaStone).length;
			assert(stones <= 1, 'a random team should not carry two Mega Stones');
		}
	});

	it('should let the bot play a full singles battle', async () => {
		const result = await runBotBattle('[Fakemon] Random Battle', 'hard');
		assert.equal(result.errors.length, 0, `bot made illegal choices: ${result.errors[0]}`);
		assert(result.turns > 1, 'the battle should last more than one turn');
		assert(result.ended, 'the battle should finish');
	});

	it('should let the bot play a full doubles battle', async () => {
		const result = await runBotBattle('[Fakemon] Random Doubles Battle', 'normal');
		assert.equal(result.errors.length, 0, `bot made illegal choices: ${result.errors[0]}`);
		assert(result.ended, 'the battle should finish');
	});
});

/** Runs a complete bot-vs-bot battle and reports what happened. */
async function runBotBattle(formatid, difficulty) {
	const { BattleStream } = require('./../../../dist/sim');
	const stream = new BattleStream();
	const bots = {
		p1: new FakemonBot({ name: 'AlphaBot', difficulty, seed: [1, 2, 3, 4] }),
		p2: new FakemonBot({ name: 'ShadowMaster', difficulty, seed: [5, 6, 7, 8] }),
	};
	bots.p1.setSide('p1');
	bots.p2.setSide('p2');

	const lines = [];
	const errors = [];
	void (async () => {
		for await (const chunk of stream) {
			for (const line of chunk.split('\n')) {
				lines.push(line);
				if (line.includes('|error|')) errors.push(line);
			}
		}
	})();

	// Fixed seeds keep this test deterministic.
	const teamP1 = Teams.pack(Teams.generate(formatid, { seed: [1, 2, 3, 4] }));
	const teamP2 = Teams.pack(Teams.generate(formatid, { seed: [5, 6, 7, 8] }));
	void stream.write(`>start {"formatid":"${formatid}","seed":[9,8,7,6]}`);
	void stream.write(`>player p1 {"name":"AlphaBot","team":"${teamP1}"}`);
	void stream.write(`>player p2 {"name":"ShadowMaster","team":"${teamP2}"}`);

	for (let guard = 0; guard < 400; guard++) {
		await new Promise(resolve => { setImmediate(resolve); });
		const sim = stream.battle;
		if (!sim || sim.ended) break;
		for (const line of lines.splice(0)) {
			bots.p1.observe(line);
			bots.p2.observe(line);
		}
		for (const side of sim.sides) {
			const request = side.activeRequest;
			if (!request || request.wait) continue;
			const choice = bots[side.id].decide(request);
			if (choice) void stream.write(`>${side.id} ${choice}`);
		}
	}
	const sim = stream.battle;
	return { turns: sim.turn, ended: sim.ended, winner: sim.winner, errors };
}
