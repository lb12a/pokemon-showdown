/**
 * Fakemon web client.
 *
 * A small, dependency-free client for the custom game. It speaks the normal
 * Pokemon Showdown protocol over the server's own SockJS endpoint, but its dex
 * comes from `/data/fakemon-data.js`, which `node build` regenerates from
 * `data/mods/fakemon/`. That is why only the custom Pokemon can ever appear
 * here - there is no original data in the client at all.
 */
'use strict';

const D = window.FakemonData;
if (!D) {
	document.body.innerHTML =
		'<p style="padding:24px;font:16px system-ui;color:#e5484d">' +
		'The Fakemon dex could not be loaded. Run <code>node build</code> in the ' +
		'server folder, then reload this page.</p>';
	throw new Error('server/static/data/fakemon-data.js is missing - run `node build`');
}
const $ = sel => document.querySelector(sel);
const el = (tag, cls, text) => {
	const node = document.createElement(tag);
	if (cls) node.className = cls;
	if (text !== undefined) node.textContent = text;
	return node;
};
const toID = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const escapeHTML = s => String(s).replace(/[&<>"]/g, c => (
	{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Central image resolution - mirrors data/mods/fakemon/assets.ts. */
const ART = {
	pokemon: name => `/assets/pokemon/${toID(name)}.png`,
	icon: name => `/assets/pokemon-icons/${toID(name)}.png`,
	item: name => `/assets/items/${toID(name)}.png`,
	placeholder: '/assets/placeholder.png',
};
function img(src, alt) {
	const node = el('img');
	node.src = src;
	node.alt = alt || '';
	node.loading = 'lazy';
	node.onerror = () => { node.onerror = null; node.src = ART.placeholder; };
	return node;
}

const FORMAT_IDS = {
	singles: 'fakemonsingles', doubles: 'fakemondoubles',
	random: 'fakemonrandombattle', randomdoubles: 'fakemonrandomdoublesbattle',
};

// =====================================================================
// Connection
// =====================================================================
const Net = {
	socket: null,
	name: '',
	rooms: {},
	connect() {
		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		this.socket = new WebSocket(`${proto}//${location.host}/showdown/websocket`);
		this.socket.onmessage = ev => this.receive(ev.data);
		this.socket.onclose = () => {
			$('#username').textContent = 'disconnected - reload to reconnect';
		};
	},
	named: false,
	/** Pending incoming challenges, keyed by the challenger's name. */
	challenges: {},
	send(text) {
		if (this.socket && this.socket.readyState === 1) this.socket.send(text);
	},
	/** A remembered name, or a fresh one - never a reserved "Guest N". */
	storedName() {
		let name = '';
		try { name = localStorage.getItem('fakemon-name') || ''; } catch {}
		if (!name || /^guest\b/i.test(name)) name = randomName();
		return name;
	},
	/** Send into a room ("" for the global/lobby context). */
	sendTo(roomid, text) {
		this.send(`${roomid || ''}|${text}`);
	},
	receive(data) {
		let roomid = '';
		if (data.startsWith('>')) {
			const cut = data.indexOf('\n');
			roomid = data.slice(1, cut === -1 ? undefined : cut);
			data = cut === -1 ? '' : data.slice(cut + 1);
		}
		for (const line of data.split('\n')) {
			if (line) this.handle(roomid, line);
		}
	},
	handle(roomid, line) {
		const parts = line.slice(1).split('|');
		const cmd = line.startsWith('|') ? parts[0] : '';
		switch (cmd) {
		case 'challstr':
			// A guest name is assigned before challstr arrives, and "Guest N" is
			// reserved, so always log in under a real name.
			this.send(`|/trn ${this.storedName()},0,`);
			return;
		case 'updateuser': {
			this.named = parts[2] === '1';
			this.name = parts[1].trim();
			if (this.named) localStorage.setItem('fakemon-name', this.name);
			$('#username').textContent = this.named ? this.name : `${this.name} (not logged in)`;
			$('#name-input').value = this.named ? this.name : '';
			return;
		}
		case 'updatechallenges': {
			// Older/other server builds send challenges as a summary object.
			try {
				const data = JSON.parse(parts[1]);
				this.challenges = { ...this.challenges, ...(data.challengesFrom || {}) };
				for (const from of Object.keys(this.challenges)) {
					if (!(data.challengesFrom || {})[from]) delete this.challenges[from];
				}
				UI.renderChallenges(this.challenges, data.challengeTo);
			} catch {}
			return;
		}
		case 'pm': {
			// This build delivers challenges as PMs:
			//   |pm| Sender| Receiver|/challenge FORMAT|FORMAT|...
			const from = parts[1].trim().replace(/^[^A-Za-z0-9]/, '');
			const to = parts[2].trim().replace(/^[^A-Za-z0-9]/, '');
			const body = parts[3] || '';
			if (!body.startsWith('/challenge')) return;
			if (toID(to) !== toID(this.name)) return; // our own outgoing challenge
			const format = (parts[4] || '').trim();
			if (format) {
				this.challenges[from] = format;
			} else {
				delete this.challenges[from];
			}
			UI.renderChallenges(this.challenges, null);
			return;
		}
		case 'popup':
			UI.notice(parts.slice(1).join('|'));
			return;
		case 'init':
			if (parts[1] === 'battle') Battle.open(roomid);
			return;
		case 'deinit':
			Battle.close(roomid);
			return;
		}
		if (roomid.startsWith('battle-')) {
			Battle.line(roomid, line);
		} else if (cmd === 'error' || (!cmd && line.trim())) {
			UI.notice(line.replace(/^\|/, ''));
		}
	},
};
function randomName() {
	return 'Trainer' + Math.floor(Math.random() * 100000);
}

// =====================================================================
// Teams (stored in the browser, like the official client)
// =====================================================================
const Teams = {
	all: [],
	load() {
		try { this.all = JSON.parse(localStorage.getItem('fakemon-teams') || '[]'); } catch { this.all = []; }
		if (!this.all.length) {
			// A new player should be able to press "Start battle" straight away.
			const starter = this.blank('Starter team');
			starter.sets = this.autoSets(6);
			this.all = [starter];
			this.save();
		}
	},
	/** Build legal sets: full evolutions, their own ability, STAB-first moves. */
	autoSets(count) {
		const pool = Object.values(D.pokedex).filter(species => {
			if (species.battleOnly || species.evos?.length) return false;
			return (D.learnsets[toID(species.name)] || []).length >= 4;
		});
		const sets = [];
		const used = new Set();
		while (sets.length < count && used.size < pool.length) {
			const species = pool[Math.floor(Math.random() * pool.length)];
			if (used.has(species.name)) continue;
			used.add(species.name);
			const physical = species.baseStats.atk >= species.baseStats.spa;
			const learnset = (D.learnsets[toID(species.name)] || []).map(id => D.moves[id]);
			const ranked = learnset.slice().sort((a, b) => score(b) - score(a));
			function score(move) {
				let value = move.basePower || 20;
				if (species.types.includes(move.type)) value *= 1.5;
				if (move.category !== 'Status' &&
					(move.category === 'Physical') !== physical) value *= 0.4;
				return value;
			}
			const moves = [];
			const seenTypes = new Set();
			for (const move of ranked) {
				if (moves.length >= 4) break;
				if (move.category !== 'Status' && seenTypes.has(move.type)) continue;
				seenTypes.add(move.type);
				moves.push(move.name);
			}
			const mega = D.megas[toID(species.name)];
			sets.push({
				spread: 'auto',
				species: species.name,
				ability: Object.values(species.abilities).filter(Boolean)[0],
				// Give the first Pokemon with a stone its stone, so Mega Evolution
				// with a stone is one click away.
				item: mega && !sets.some(s => D.items[toID(s.item)]?.megaStone) ? mega.stone : '',
				moves: moves.concat(['', '', '', '']).slice(0, 4),
			});
		}
		return sets;
	},
	save() {
		try { localStorage.setItem('fakemon-teams', JSON.stringify(this.all)); } catch {}
	},
	blank(name) {
		return { name: name || 'New team', format: 'singles', sets: [this.blankSet()] };
	},
	blankSet() {
		return {
			species: '', ability: '', item: '', moves: ['', '', '', ''], level: 100,
			nature: 'Serious',
			evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
			ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
			// Only read when the team is handed to the bot; on your own team the
			// engine already lets everything Mega Evolve.
			mega: false,
		};
	},
	/**
	 * Teams saved before EVs, IVs and natures were editable only carried a
	 * spread preset. Fill the missing fields in from that preset once, so an
	 * old team keeps the spread it used to play with.
	 */
	migrate(set) {
		if (!set.evs || !set.ivs || !set.nature) {
			const species = D.pokedex[toID(set.species)];
			const preset = species ? this.presetFor(species, set.spread) : null;
			set.nature = set.nature || preset?.nature || 'Serious';
			set.evs = set.evs || { ...{ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ...(preset?.evs || {}) };
			set.ivs = set.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
			delete set.spread;
		}
		if (set.level === undefined) set.level = 100;
		if (set.mega === undefined) set.mega = false;
		return set;
	},
	/**
	 * A starting point for a spread. EVs, IVs and the nature are edited by hand
	 * now; these presets are the one-click fill, and what an old saved team is
	 * migrated from.
	 */
	presetFor(species, spread) {
		spread = spread || 'auto';
		if (spread === 'auto') {
			const s = species.baseStats;
			const bulky = (s.def + s.spd + s.hp) > (s.atk + s.spa + s.spe);
			spread = bulky ? 'bulky' : (s.atk >= s.spa ? 'physical' : 'special');
		}
		switch (spread) {
		case 'physical': return { nature: 'Adamant', evs: { atk: 252, spe: 252, hp: 4 } };
		case 'special': return { nature: 'Modest', evs: { spa: 252, spe: 252, hp: 4 } };
		case 'fast': return { nature: 'Jolly', evs: { spe: 252, atk: 252, hp: 4 } };
		case 'bulky': default: return { nature: 'Calm', evs: { hp: 252, def: 128, spd: 128 } };
		}
	},
	/** Showdown's packed team format. */
	pack(team) {
		return team.sets.filter(set => set.species).map(set => {
			const species = D.pokedex[toID(set.species)];
			if (!species) return '';
			this.migrate(set);
			const moves = set.moves.filter(Boolean).map(toID).join(',');
			const level = clampLevel(set.level);
			const evs = { ...set.evs };
			// Showdown flags a level-50 set with a round EV total as a probable
			// import mistake; one spare EV point is the documented "I meant it".
			if (level !== 100 && Object.values(evs).reduce((a, b) => a + b, 0) % 4 === 0) {
				evs.hp = Math.min(252, (evs.hp || 0) + 1);
			}
			const packedEvs = STATS.map(stat => evs[stat] || '').join(',');
			// 31 is the default, so a full spread packs as an empty field.
			const ivs = STATS.map(stat => (set.ivs[stat] === 31 ? '' : String(set.ivs[stat] ?? 31)));
			const packedIvs = ivs.every(value => value === '') ? '' : ivs.join(',');
			// name|species|item|ability|moves|nature|evs|gender|ivs|shiny|level|happiness
			return [
				species.name, '', toID(set.item), toID(set.ability), moves,
				set.nature || 'Serious', packedEvs, '', packedIvs, '',
				level === 100 ? '' : String(level), '',
			].join('|');
		}).filter(Boolean).join(']');
	},
	/**
	 * Pokemon Showdown's text format.
	 *
	 * `(M)` after the species is this game's Mega marker, not a gender: the
	 * team builder has no genders, and a packed set from here always leaves the
	 * gender field empty. On import both `(M)` and `(Mega)` are accepted.
	 */
	export(team) {
		return team.sets.filter(set => set.species).map(set => {
			this.migrate(set);
			const species = D.pokedex[toID(set.species)];
			const lines = [];
			const item = D.items[toID(set.item)];
			lines.push(`${species ? species.name : set.species}${set.mega ? ' (M)' : ''}` +
				(item ? ` @ ${item.name}` : ''));
			if (set.ability) lines.push(`Ability: ${set.ability}`);
			const level = clampLevel(set.level);
			if (level !== 100) lines.push(`Level: ${level}`);
			const evs = STATS.filter(stat => set.evs[stat])
				.map(stat => `${set.evs[stat]} ${STAT_LABEL[stat]}`);
			if (evs.length) lines.push(`EVs: ${evs.join(' / ')}`);
			lines.push(`${set.nature || 'Serious'} Nature`);
			const ivs = STATS.filter(stat => (set.ivs[stat] ?? 31) !== 31)
				.map(stat => `${set.ivs[stat]} ${STAT_LABEL[stat]}`);
			if (ivs.length) lines.push(`IVs: ${ivs.join(' / ')}`);
			for (const move of set.moves.filter(Boolean)) {
				lines.push(`- ${D.moves[toID(move)]?.name || move}`);
			}
			return lines.join('\n');
		}).join('\n\n');
	},
	/** Reads the text format back. Returns { sets, problems }. */
	import(text) {
		const problems = [];
		const sets = [];
		let set = null;
		const statByLabel = {};
		for (const stat of STATS) statByLabel[STAT_LABEL[stat].toLowerCase()] = stat;

		const finish = () => {
			if (set) sets.push(set);
			set = null;
		};
		for (const raw of String(text).split('\n')) {
			const line = raw.trim();
			if (!line) { finish(); continue; }

			if (line.startsWith('-') || line.startsWith('~')) {
				if (!set) continue;
				const name = line.slice(1).trim().split('[')[0].trim();
				const move = D.moves[toID(name)];
				if (!move) { problems.push(`Unknown move "${name}".`); continue; }
				if (set.moves.filter(Boolean).length >= 4) {
					problems.push(`${set.species} has more than four moves; the extra ones were dropped.`);
					continue;
				}
				set.moves[set.moves.findIndex(slot => !slot)] = move.name;
				continue;
			}
			const labelled = /^([A-Za-z .]+):\s*(.*)$/.exec(line);
			if (set && labelled) {
				const key = labelled[1].trim().toLowerCase();
				const value = labelled[2].trim();
				if (key === 'ability') {
					set.ability = value;
				} else if (key === 'level') {
					set.level = clampLevel(value);
				} else if (key === 'evs' || key === 'ivs') {
					const target = key === 'evs' ? set.evs : set.ivs;
					if (key === 'ivs') for (const stat of STATS) target[stat] = 31;
					for (const part of value.split('/')) {
						const [amount, label] = part.trim().split(/\s+/);
						const stat = statByLabel[(label || '').toLowerCase()];
						if (stat) target[stat] = Math.max(0, Math.min(key === 'evs' ? 252 : 31, Number(amount) || 0));
					}
				}
				// Shiny, Happiness, Tera Type and the rest of the format are read
				// and ignored: this game does not have them.
				continue;
			}
			const nature = /^([A-Za-z]+)\s+Nature/.exec(line);
			if (set && nature) {
				if (NATURES[nature[1]]) set.nature = nature[1];
				else problems.push(`Unknown nature "${nature[1]}".`);
				continue;
			}

			// Anything else starts a new Pokemon.
			finish();
			let head = line;
			let mega = false;
			let item = '';
			const at = head.lastIndexOf(' @ ');
			if (at !== -1) {
				item = head.slice(at + 3).trim();
				head = head.slice(0, at).trim();
			}
			head = head.replace(/\((M|Mega)\)\s*$/i, () => { mega = true; return ''; }).trim();
			head = head.replace(/\((F|M)\)\s*$/i, '').trim();
			// "Nickname (Species)" - the species in brackets wins.
			const bracket = /\(([^()]+)\)\s*$/.exec(head);
			const wanted = bracket ? bracket[1].trim() : head;
			const species = D.pokedex[toID(wanted)];
			if (!species) { problems.push(`Unknown Pokémon "${wanted}".`); continue; }
			set = this.blankSet();
			set.species = species.name;
			set.mega = mega;
			if (item) {
				const found = D.items[toID(item)];
				if (found) set.item = found.name;
				else problems.push(`Unknown item "${item}".`);
			}
		}
		finish();
		if (!sets.length) problems.push('No Pokémon found in that text.');
		return { sets: sets.slice(0, 6), problems };
	},

	/** Problems a player should fix before battling; the server re-checks anyway. */
	problems(team) {
		const out = [];
		const used = new Set();
		const sets = team.sets.filter(set => set.species);
		if (!sets.length) out.push('The team is empty.');
		for (const set of sets) {
			const id = toID(set.species);
			const species = D.pokedex[id];
			if (!species) { out.push(`${set.species} is not a Fakemon.`); continue; }
			if (species.battleOnly) out.push(`${species.name} is a Mega forme and cannot be on a team.`);
			if (used.has(id)) out.push(`${species.name} is on the team twice (Species Clause).`);
			used.add(id);
			if (!set.ability) out.push(`${species.name} has no ability.`);
			const moves = set.moves.filter(Boolean);
			if (!moves.length) out.push(`${species.name} has no moves.`);
			const learnset = D.learnsets[id] || [];
			for (const move of moves) {
				if (!learnset.includes(toID(move))) {
					out.push(`${species.name} cannot learn ${D.moves[toID(move)]?.name || move}.`);
				}
			}
			const item = D.items[toID(set.item)];
			if (item && item.megaStone && !item.megaStone[species.name]) {
				out.push(`${item.name} belongs to ${Object.keys(item.megaStone).join('/')}, not ${species.name}.`);
			}
			// No item and one to three moves are both perfectly legal; only the
			// numbers that the server would reject are worth reporting.
			this.migrate(set);
			const evTotal = STATS.reduce((total, stat) => total + (set.evs[stat] || 0), 0);
			if (evTotal > EV_LIMIT) {
				out.push(`${species.name} has ${evTotal} EVs, more than the limit of ${EV_LIMIT}.`);
			}
			for (const stat of STATS) {
				if ((set.evs[stat] || 0) > 252) out.push(`${species.name}: ${STAT_LABEL[stat]} EVs above 252.`);
				const iv = set.ivs[stat];
				if (iv < 0 || iv > 31) out.push(`${species.name}: ${STAT_LABEL[stat]} IVs must be 0-31.`);
			}
			if (!NATURES[set.nature]) out.push(`${species.name} has an unknown nature.`);
		}
		return out;
	},
};

// =====================================================================
// UI shell
// =====================================================================
const UI = {
	editing: null,
	init() {
		for (const tab of document.querySelectorAll('.tab')) {
			tab.onclick = () => this.show(tab.dataset.view);
		}
		this.show('play');

		$('#start-bot').onclick = () => this.startBot();
		$('#send-challenge').onclick = () => this.sendChallenge();
		$('#set-name').onclick = () => {
			const name = $('#name-input').value.trim();
			if (!name || /^guest\b/i.test(name)) {
				return this.notice('Pick a name that does not start with "Guest".');
			}
			try { localStorage.setItem('fakemon-name', name); } catch {}
			Net.send(`|/trn ${name},0,`);
		};
		$('#new-team').onclick = () => {
			const team = Teams.blank(`Team ${Teams.all.length + 1}`);
			team.sets = Teams.autoSets(6);
			Teams.all.push(team);
			Teams.save();
			this.editTeam(Teams.all.length - 1);
		};
		$('#close-team').onclick = () => { this.editing = null; this.renderTeams(); };
		$('#save-team').onclick = () => {
			Teams.save();
			this.renderTeamEditor();
			this.refreshTeamPickers();
		};
		$('#copy-team').onclick = () => {
			const copy = JSON.parse(JSON.stringify(Teams.all[this.editing]));
			copy.name += ' (copy)';
			Teams.all.push(copy);
			Teams.save();
			this.editTeam(Teams.all.length - 1);
		};
		$('#delete-team').onclick = () => {
			Teams.all.splice(this.editing, 1);
			if (!Teams.all.length) Teams.all.push(Teams.blank());
			Teams.save();
			this.editing = null;
			this.renderTeams();
			this.refreshTeamPickers();
		};
		$('#bot-teammode').onchange = () => {
			$('#bot-own-team-row').hidden = $('#bot-teammode').value !== 'custom';
		};
		$('#toggle-port').onclick = () => {
			const box = $('#team-port');
			box.hidden = !box.hidden;
			if (!box.hidden) this.fillPort();
		};
		$('#team-export').onclick = () => this.fillPort();
		$('#team-import').onclick = () => this.importPort(false);
		$('#team-import-new').onclick = () => this.importPort(true);
		$('#dex-search').oninput = () => this.renderDex();

		this.renderTeams();
		this.refreshTeamPickers();
		this.renderDex();
	},
	show(view) {
		for (const node of document.querySelectorAll('.view')) node.classList.remove('active');
		for (const tab of document.querySelectorAll('.tab')) tab.classList.remove('active');
		$(`#view-${view}`).classList.add('active');
		const tab = document.querySelector(`.tab[data-view="${view}"]`);
		if (tab) tab.classList.add('active');
	},
	notice(text) {
		const line = text.replace(/\|/g, ' ').trim();
		if (line) console.log('[server]', line);
		const box = $('#challenges');
		if (box && /challenge|team|invalid|cannot|not a|rejected/i.test(line)) {
			box.textContent = line;
		}
	},

	// ---------- team pickers ----------
	refreshTeamPickers() {
		for (const id of ['#bot-team', '#bot-own-team', '#pvp-team']) {
			const select = $(id);
			const previous = select.value;
			select.innerHTML = '';
			Teams.all.forEach((team, i) => {
				const option = el('option', null,
					`${team.name} (${team.sets.filter(s => s.species).length})`);
				option.value = String(i);
				select.appendChild(option);
			});
			if (previous && Teams.all[previous]) select.value = previous;
		}
	},
	selectedTeam(pickerId) {
		return Teams.all[Number($(pickerId).value)] || Teams.all[0];
	},

	// ---------- play ----------
	useTeam(team, format) {
		// Random formats generate teams server-side; sending one would be ignored.
		if (format.startsWith('random')) {
			Net.send(`|/utm null`);
			return true;
		}
		const problems = Teams.problems(team);
		if (problems.length) {
			$('#challenges').innerHTML = `<div class="problem">${problems.map(escapeHTML).join('<br />')}</div>`;
			return false;
		}
		Net.send(`|/utm ${Teams.pack(team)}`);
		return true;
	},
	startBot() {
		const format = $('#bot-format').value;
		const team = this.selectedTeam('#bot-team');
		if (!this.useTeam(team, format)) return;
		const name = $('#bot-name').value.trim() || 'Fakemon Bot';
		const mode = $('#bot-teammode').value;
		const difficulty = $('#bot-difficulty').value;
		// "custom" means you built both sides: the bot's team is a packed team,
		// which is full of commas, so it goes in its own command first.
		if (mode === 'custom' && !format.startsWith('random')) {
			const botTeam = this.selectedTeam('#bot-own-team');
			const problems = Teams.problems(botTeam);
			if (problems.length) {
				$('#challenges').innerHTML =
					`<div class="problem">The bot's team: ${problems.map(escapeHTML).join('<br />')}</div>`;
				return;
			}
			// Which of the bot's Pokemon it is allowed to Mega Evolve. With
			// exactly one named, it is guaranteed to use it.
			const megas = botTeam.sets.filter(set => set.species && set.mega)
				.map(set => toID(set.species));
			Net.send(`|/fakemonbotteam megas=${megas.join(',')};${Teams.pack(botTeam)}`);
		}
		setTimeout(() => {
			Net.send(`|/fakemonbot ${format}, ${name}, ${mode}, ${difficulty}`);
		}, 60);
	},
	sendChallenge() {
		const target = $('#pvp-name').value.trim();
		if (!target) return this.notice('Enter a username to challenge.');
		const format = $('#pvp-format').value;
		const team = this.selectedTeam('#pvp-team');
		if (!this.useTeam(team, format)) return;
		setTimeout(() => {
			Net.send(`|/challenge ${target}, ${FORMAT_IDS[format]}`);
			$('#challenges').textContent = `Challenge sent to ${target}.`;
		}, 60);
	},
	renderChallenges(incoming, challengeTo) {
		const box = $('#challenges');
		box.innerHTML = '';
		for (const from of Object.keys(incoming || {})) {
			const formatId = incoming[from];
			const row = el('div', 'row');
			row.appendChild(el('span', null, `${from} challenges you (${formatId})`));
			const accept = el('button', 'primary', 'Accept');
			accept.onclick = () => {
				const format = formatId.includes('random') ? 'random' :
					(formatId.includes('doubles') ? 'doubles' : 'singles');
				if (!this.useTeam(this.selectedTeam('#pvp-team'), format)) return;
				delete Net.challenges[from];
				setTimeout(() => Net.send(`|/accept ${from}`), 60);
			};
			const reject = el('button', null, 'Reject');
			reject.onclick = () => {
				delete Net.challenges[from];
				Net.send(`|/reject ${from}`);
				this.renderChallenges(Net.challenges, null);
			};
			row.append(accept, reject);
			box.appendChild(row);
		}
		if (challengeTo) {
			box.appendChild(el('div', 'hint', `Waiting for ${challengeTo.to} to accept…`));
		}
	},

	// ---------- teambuilder ----------
	renderTeams() {
		$('#team-list-panel').hidden = false;
		$('#team-edit-panel').hidden = true;
		const list = $('#team-list');
		list.innerHTML = '';
		Teams.all.forEach((team, i) => {
			const card = el('div', 'team-card');
			const icons = el('div', 'team-icons');
			for (const set of team.sets) {
				if (set.species) icons.appendChild(img(ART.icon(set.species), set.species));
			}
			card.append(el('strong', null, team.name), icons);
			const edit = el('button', null, 'Edit');
			edit.onclick = () => this.editTeam(i);
			card.appendChild(edit);
			list.appendChild(card);
		});
	},
	editTeam(index) {
		this.editing = index;
		$('#team-list-panel').hidden = true;
		$('#team-edit-panel').hidden = false;
		const team = Teams.all[index];
		$('#team-name').value = team.name;
		$('#team-name').oninput = e => { team.name = e.target.value; Teams.save(); };
		$('#team-format').value = team.format || 'singles';
		$('#team-format').onchange = e => { team.format = e.target.value; Teams.save(); };
		this.renderTeamEditor();
	},
	renderTeamEditor() {
		const team = Teams.all[this.editing];
		while (team.sets.length < 6) team.sets.push(Teams.blankSet());
		team.sets.forEach(set => Teams.migrate(set));
		const wrap = $('#team-slots');
		wrap.innerHTML = '';
		team.sets.forEach((set, i) => wrap.appendChild(this.renderSlot(team, set, i)));

		const problems = Teams.problems(team);
		$('#team-validation').innerHTML = problems.length ?
			`<div class="problem">${problems.map(escapeHTML).join('<br />')}</div>` :
			`<div class="ok">Team is legal.</div>`;
		this.refreshTeamPickers();
	},
	fillPort() {
		$('#team-port-text').value = Teams.export(Teams.all[this.editing]);
		$('#team-port-result').textContent = '';
	},
	importPort(asNewTeam) {
		const { sets, problems } = Teams.import($('#team-port-text').value);
		const box = $('#team-port-result');
		if (!sets.length) {
			box.innerHTML = `<div class="problem">${problems.map(escapeHTML).join('<br />')}</div>`;
			return;
		}
		if (asNewTeam) {
			const team = Teams.blank(`Imported ${Teams.all.length + 1}`);
			team.sets = sets;
			Teams.all.push(team);
			this.editing = Teams.all.length - 1;
		} else {
			Teams.all[this.editing].sets = sets;
		}
		Teams.save();
		this.renderTeamEditor();
		this.refreshTeamPickers();
		box.innerHTML = problems.length ?
			`<div class="problem">Imported ${sets.length} Pokémon, with problems:<br />` +
			`${problems.map(escapeHTML).join('<br />')}</div>` :
			`<div class="ok">Imported ${sets.length} Pokémon.</div>`;
	},
	renderSlot(team, set, index) {
		const slot = el('div', 'slot');
		const species = D.pokedex[toID(set.species)];

		const head = el('div', 'slot-head');
		head.appendChild(img(species ? ART.icon(species.name) : ART.placeholder, set.species));
		const title = el('div', 'grow');
		if (species) {
			const name = el('div', 'mon-name', species.name);
			const types = el('div');
			for (const type of species.types) {
				types.appendChild(el('span', `type type-${type}`, type));
			}
			title.append(name, types);
		} else {
			title.appendChild(el('div', 'hint', `Slot ${index + 1} - empty`));
		}
		head.appendChild(title);
		slot.appendChild(head);

		const grid = el('div', 'slot-grid');
		grid.appendChild(this.picker('Pokémon', speciesOptions(), set.species, value => {
			set.species = value;
			set.ability = '';
			set.moves = ['', '', '', ''];
			Teams.save();
			this.renderTeamEditor();
		}));
		if (species) {
			const abilities = Object.values(species.abilities).filter(Boolean);
			grid.appendChild(this.picker('Ability', abilities.map(a => [a, a]), set.ability, value => {
				set.ability = value;
				Teams.save();
				this.renderTeamEditor();
			}));
			grid.appendChild(this.picker('Item', itemOptions(species), set.item, value => {
				set.item = value;
				Teams.save();
				this.renderTeamEditor();
			}));
			grid.appendChild(this.picker('Level', LEVELS, String(clampLevel(set.level)), value => {
				set.level = clampLevel(value);
				Teams.save();
				this.renderTeamEditor();
			}));
			grid.appendChild(this.picker('Nature',
				Object.keys(NATURES).sort().map(name => {
					const [up, down] = NATURES[name];
					return [name, up ? `${name} (+${STAT_LABEL[up]}, -${STAT_LABEL[down]})` : `${name} (neutral)`];
				}), set.nature, value => {
					set.nature = value;
					Teams.save();
					this.renderTeamEditor();
				}));
			grid.appendChild(this.picker('Fill spread', [
				['', 'Keep what is set'],
				['auto', 'Auto (from base stats)'],
				['physical', 'Physical sweeper'],
				['special', 'Special sweeper'],
				['fast', 'Fast attacker'],
				['bulky', 'Bulky wall'],
			], '', value => {
				if (!value) return;
				const preset = Teams.presetFor(species, value);
				set.nature = preset.nature;
				for (const stat of STATS) set.evs[stat] = preset.evs[stat] || 0;
				Teams.save();
				this.renderTeamEditor();
			}));
		}
		slot.appendChild(grid);

		if (species) {
			const learnset = (D.learnsets[toID(species.name)] || [])
				.map(id => [D.moves[id].name, `${D.moves[id].name} — ${D.moves[id].type} ${D.moves[id].category}` +
				(D.moves[id].basePower ? ` ${D.moves[id].basePower}` : '')])
				.sort((a, b) => a[0].localeCompare(b[0]));
			const moves = el('div', 'moves-grid');
			for (let i = 0; i < 4; i++) {
				moves.appendChild(this.picker(`Move ${i + 1}`, learnset, set.moves[i], value => {
					set.moves[i] = value;
					Teams.save();
					this.renderTeamEditor();
				}));
			}
			slot.appendChild(moves);

			const stats = species.baseStats;
			const bst = Object.values(stats).reduce((a, b) => a + b, 0);
			slot.appendChild(el('div', 'statline',
				`Base: HP ${stats.hp} · Atk ${stats.atk} · Def ${stats.def} · ` +
				`SpA ${stats.spa} · SpD ${stats.spd} · Spe ${stats.spe} · BST ${bst}`));
			slot.append(
				this.statRow('EVs', set, 'evs', 0, 252, species),
				this.statRow('IVs', set, 'ivs', 0, 31, species)
			);
			const level = clampLevel(set.level);
			slot.appendChild(el('div', 'statline', `At level ${level}: ` + STATS.map(stat =>
				`${STAT_LABEL[stat]} ${finalStat(stat, stats[stat], set.evs[stat] || 0,
					set.ivs[stat] ?? 31, level, set.nature)}`).join(' · ')));

			// Only the bot reads this; on your own team every Pokemon may Mega
			// Evolve anyway, so it is labelled as what it is.
			const megaFlag = el('label', 'mega-flag');
			const box = el('input');
			box.type = 'checkbox';
			box.checked = !!set.mega;
			box.onchange = () => {
				set.mega = box.checked;
				Teams.save();
				this.renderTeamEditor();
			};
			megaFlag.append(box, el('span', null,
				'Bot may Mega Evolve this one  (marked "(M)" on export; no effect on your own team)'));
			slot.appendChild(megaFlag);

			// Mega information (spec 13): what this Pokemon becomes, and how.
			const mega = D.megas[toID(species.name)];
			const note = el('div', 'mega-note');
			const stone = D.items[toID(set.item)];
			if (mega && stone && stone.megaStone && stone.megaStone[species.name]) {
				const form = D.pokedex[toID(mega.forme)];
				const megaBst = Object.values(form.baseStats).reduce((a, b) => a + b, 0);
				note.innerHTML = `<strong>Mega Evolution ready.</strong> Holding ${escapeHTML(mega.stone)} ` +
					`turns it into ${escapeHTML(mega.forme)} (BST ${megaBst}, +${megaBst - bst}) ` +
					`with the Mega Ability <strong>${escapeHTML(mega.ability)}</strong>.<br />` +
					`HP ${form.baseStats.hp} · Atk ${form.baseStats.atk} · Def ${form.baseStats.def} · ` +
					`SpA ${form.baseStats.spa} · SpD ${form.baseStats.spd} · Spe ${form.baseStats.spe}`;
			} else if (mega) {
				note.innerHTML = `Has a Mega Stone: give it <strong>${escapeHTML(mega.stone)}</strong> to ` +
					`become ${escapeHTML(mega.forme)} with ${escapeHTML(mega.ability)}. ` +
					`Without it, Mega Evolving gives +20 to every base stat (BST ${bst + 120}).`;
			} else {
				note.innerHTML = `No Mega Stone. Mega Evolving gives <strong>+20 to every base stat</strong> ` +
					`(BST ${bst} &rarr; ${bst + 120}) and it keeps its ability and species.`;
			}
			slot.appendChild(note);
		}
		return slot;
	},
	/** Six number inputs for one of the two stat spreads. */
	statRow(label, set, key, min, max, species) {
		const wrap = el('div');
		const grid = el('div', 'ev-grid');
		const total = el('div', 'ev-total');
		const refreshTotal = () => {
			if (key !== 'evs') return;
			const sum = STATS.reduce((acc, stat) => acc + (set.evs[stat] || 0), 0);
			total.textContent = `${sum} / ${EV_LIMIT} EVs`;
			total.classList.toggle('over', sum > EV_LIMIT);
		};
		for (const stat of STATS) {
			const cell = el('label', null, `${label === 'EVs' ? '' : ''}${STAT_LABEL[stat]}`);
			const input = el('input');
			input.type = 'number';
			input.min = String(min);
			input.max = String(max);
			input.value = String(set[key][stat] ?? (key === 'ivs' ? 31 : 0));
			input.oninput = () => {
				const value = Math.max(min, Math.min(max, Math.round(Number(input.value) || 0)));
				set[key][stat] = value;
				refreshTotal();
				Teams.save();
			};
			// Re-render once the field is left, so the stat line catches up.
			input.onchange = () => this.renderTeamEditor();
			cell.appendChild(input);
			grid.appendChild(cell);
		}
		wrap.append(el('div', 'statline', label), grid);
		if (key === 'evs') {
			refreshTotal();
			wrap.appendChild(total);
		}
		return wrap;
	},

	picker(label, options, value, onChange) {
		const wrap = el('label', null, label);
		const select = el('select');
		select.appendChild(el('option', null, '—'));
		const groups = {};
		for (const option of options) {
			const [val, text, group] = Array.isArray(option) ? option : [option, option];
			const node = el('option', null, text);
			node.value = val;
			// A group turns the flat list into <optgroup> sections.
			if (group) {
				if (!groups[group]) {
					groups[group] = el('optgroup');
					groups[group].label = group;
					select.appendChild(groups[group]);
				}
				groups[group].appendChild(node);
				continue;
			}
			select.appendChild(node);
		}
		select.value = value || '';
		select.onchange = () => onChange(select.value);
		wrap.appendChild(select);
		return wrap;
	},

	// ---------- dex ----------
	renderDex() {
		const query = toID($('#dex-search').value);
		const out = $('#dex-results');
		out.innerHTML = '';
		let shown = 0;
		const add = node => {
			if (shown >= 60) return;
			out.appendChild(node);
			shown++;
		};

		for (const [id, species] of Object.entries(D.pokedex)) {
			if (query && !id.includes(query)) continue;
			const card = el('div', 'team-card');
			card.appendChild(img(ART.icon(species.name), species.name));
			const info = el('div', 'grow');
			const title = el('div', 'mon-name', species.name);
			const types = el('div');
			for (const type of species.types) types.appendChild(el('span', `type type-${type}`, type));
			const stats = species.baseStats;
			info.append(title, types, el('div', 'statline',
				`HP ${stats.hp} · Atk ${stats.atk} · Def ${stats.def} · SpA ${stats.spa} · ` +
				`SpD ${stats.spd} · Spe ${stats.spe} · ` +
				`Abilities: ${Object.values(species.abilities).filter(Boolean).join(', ')}`));
			card.appendChild(info);
			add(card);
		}
		if (query) {
			for (const [id, move] of Object.entries(D.moves)) {
				if (!id.includes(query)) continue;
				add(el('div', 'team-card',
					`${move.name} — ${move.type} ${move.category} · ` +
					`Power ${move.basePower || '-'} · Acc ${move.accuracy === true ? '-' : move.accuracy} · ` +
					`PP ${move.pp} · ${move.desc}`));
			}
			for (const [id, ability] of Object.entries(D.abilities)) {
				if (!id.includes(query)) continue;
				add(el('div', 'team-card',
					`${ability.name}${ability.isMega ? ' (Mega Ability)' : ''} — ${ability.desc}`));
			}
			for (const [id, item] of Object.entries(D.items)) {
				if (!id.includes(query)) continue;
				add(el('div', 'team-card', `${item.name} — ${item.desc}`));
			}
		}
		if (!shown) out.appendChild(el('div', 'hint', 'Nothing found in the Fakemon dex.'));
	},
};

function speciesOptions() {
	return Object.values(D.pokedex)
		.filter(species => !species.battleOnly)
		.map(species => [species.name, `${species.name} (${species.types.join('/')})`])
		.sort((a, b) => a[0].localeCompare(b[0]));
}
const ITEM_GROUP_ORDER = ['Mega Stone', 'Core', 'Food', 'Consumable', 'Battle gear', 'Permanent gear'];

/** The six stats, in the order every packed team and every UI row uses. */
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABEL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

/** The 25 natures: which stat each one raises and which it lowers. */
const NATURES = {
	Hardy: [], Lonely: ['atk', 'def'], Brave: ['atk', 'spe'], Adamant: ['atk', 'spa'],
	Naughty: ['atk', 'spd'], Bold: ['def', 'atk'], Docile: [], Relaxed: ['def', 'spe'],
	Impish: ['def', 'spa'], Lax: ['def', 'spd'], Timid: ['spe', 'atk'], Hasty: ['spe', 'def'],
	Serious: [], Jolly: ['spe', 'spa'], Naive: ['spe', 'spd'], Modest: ['spa', 'atk'],
	Mild: ['spa', 'def'], Quiet: ['spa', 'spe'], Bashful: [], Rash: ['spa', 'spd'],
	Calm: ['spd', 'atk'], Gentle: ['spd', 'def'], Sassy: ['spd', 'spe'], Careful: ['spd', 'spa'],
	Quirky: [],
};
const EV_LIMIT = 510;

/** The stat a level, base stat, IV, EV and nature actually produce. */
function finalStat(stat, base, ev, iv, level, nature) {
	if (stat === 'hp') {
		if (base === 1) return 1;
		return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
	}
	const raw = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5;
	const [up, down] = NATURES[nature] || [];
	if (up === stat) return Math.floor(raw * 1.1);
	if (down === stat) return Math.floor(raw * 0.9);
	return raw;
}

/** Levels a Pokemon can be sent out at. 100 is the default. */
const LEVELS = Array.from({ length: 100 }, (_, i) => String(100 - i));
function clampLevel(value) {
	const level = Math.round(Number(value));
	if (!level || isNaN(level)) return 100;
	return Math.min(100, Math.max(1, level));
}

/**
 * Move targets the player picks by hand in a double battle. Everything else
 * (spread moves, the whole field, the user itself, a side) resolves on its own
 * and must NOT be sent with a target - the server rejects that as an error.
 */
const CHOOSABLE_TARGETS = ['normal', 'any', 'adjacentFoe', 'adjacentAlly', 'adjacentAllyOrSelf'];

/**
 * Is the Pokemon in `slot` on `side` a legal target for the pending move?
 * `pending.slot` is the index of the Pokemon that is choosing.
 *
 * `normal` and `any` reach the ally as well as the foes, which is how a double
 * battle lets you hit your own partner on purpose.
 */
function isLegalTarget(pending, isFoe, slot) {
	const isSelf = !isFoe && slot === pending.slot;
	switch (pending.target) {
	case 'adjacentFoe': return isFoe;
	case 'adjacentAlly': return !isFoe && !isSelf;
	case 'adjacentAllyOrSelf': return !isFoe;
	case 'normal': case 'any': return isFoe || !isSelf;
	default: return false;
	}
}

function itemOptions(species) {
	return Object.values(D.items)
		// A Mega Stone is only offered to the Pokemon it belongs to.
		.filter(item => !item.megaStone || item.megaStone[species.name])
		.map(item => [
			item.name,
			item.megaStone ? `${item.name} (Mega Stone)` : `${item.name} — ${item.desc}`,
			item.group || 'Core',
		])
		.sort((a, b) => {
			const order = ITEM_GROUP_ORDER.indexOf(a[2]) - ITEM_GROUP_ORDER.indexOf(b[2]);
			return order || a[0].localeCompare(b[0]);
		});
}

/**
 * What a win would be worth.
 *
 * The dex defines no experience yield or trainer payout, so both are derived:
 * a species' base yield is 45% of its base stat total (which puts a 320 BST
 * starter near 144 and a 600 BST legendary near 270, the range the real games
 * use), and the trainer payout is the usual 60 per level of the last Pokemon
 * they sent out. Everything else is the normal Pokemon maths.
 */
const REWARDS = {
	/** Base experience yield, derived from the base stat total. */
	baseYield(speciesName) {
		const species = D.pokedex[toID(speciesName)];
		if (!species) return 60;
		const bst = Object.values(species.baseStats).reduce((a, b) => a + b, 0);
		return Math.round(bst * 0.45);
	},
	/**
	 * Gen 5+ experience: floor(floor(b * L / 5) / s * scale) + 1, where the
	 * scale term is ((2L + 10) / (L + Lp + 10)) ^ 2.5.
	 */
	exp(defeatedSpecies, defeatedLevel, winnerLevel, participants) {
		const b = this.baseYield(defeatedSpecies);
		const L = Math.max(1, defeatedLevel);
		const Lp = Math.max(1, winnerLevel);
		const scale = ((2 * L + 10) / (L + Lp + 10)) ** 2.5;
		return Math.floor(Math.floor(b * L / 5) / Math.max(1, participants) * scale) + 1;
	},
	/** A trainer pays out 60 per level of the last Pokemon they used. */
	prizeMoney(lastLevel) {
		return 60 * Math.max(1, lastLevel);
	},
};

// =====================================================================
// Battle
// =====================================================================
const Battle = {
	rooms: {},
	open(roomid) {
		if (this.rooms[roomid]) return;
		const node = el('div', 'panel');
		node.id = `room-${roomid}`;
		node.innerHTML = `
			<h2 class="battle-title">Battle</h2>
			<div class="battle">
				<div class="field">
					<div class="side" data-side="foe"><h3>Opponent</h3><div class="active-row"></div></div>
					<div class="side" data-side="me"><h3>You</h3><div class="active-row"></div></div>
					<div class="controls"></div>
				</div>
				<div class="log"></div>
			</div>`;
		$('#battles').prepend(node);
		this.rooms[roomid] = {
			node, sides: { p1: {}, p2: {} }, mySide: 'p1',
			request: null, mega: false, pendingMove: null, active: { p1: [], p2: [] },
			// In doubles a turn needs one choice per active Pokemon; they are
			// collected here and sent together.
			choices: [],
			// Everything the reward screen needs: who fainted at what level,
			// and which of your Pokemon were out at the time.
			knockouts: [],
			levels: {},
			roster: [],
		};
		UI.show('battle');
	},
	close(roomid) {
		const room = this.rooms[roomid];
		if (room) room.node.remove();
		delete this.rooms[roomid];
	},
	log(roomid, text, cls) {
		const room = this.rooms[roomid];
		if (!room) return;
		const box = room.node.querySelector('.log');
		box.appendChild(el('div', cls, text));
		box.scrollTop = box.scrollHeight;
	},

	line(roomid, line) {
		if (!this.rooms[roomid]) this.open(roomid);
		const room = this.rooms[roomid];
		if (!line.startsWith('|')) return;
		const p = line.slice(1).split('|');
		switch (p[0]) {
		case 'player': {
			if (p[2] && toID(p[2]) === toID(Net.name)) room.mySide = p[1];
			room.sides[p[1]].name = p[2];
			this.title(roomid);
			break;
		}
		case 'teamsize':
			room.sides[p[1]].size = Number(p[2]);
			break;
		case 'turn':
			this.log(roomid, `Turn ${p[1]}`, 'turn');
			break;
		case 'switch': case 'drag': case 'replace': case 'detailschange': {
			const pos = p[1].split(':')[0];
			const nick = p[1].split(': ')[1];
			const species = p[2].split(',')[0].trim();
			const mon = this.mon(room, pos);
			// "Species, L50, M" - the level is only in the switch details.
			const level = Number(/L(\d+)/.exec(p[2])?.[1]) || 100;
			Object.assign(mon, { species, nick, level, hp: 100, maxhp: 100, status: '', fainted: false });
			room.levels[species] = level;
			if (pos.slice(0, 2) === room.mySide && !room.roster.includes(species)) {
				room.roster.push(species);
			}
			if (p[0] !== 'detailschange') mon.mega = false;
			this.setHP(mon, p[3]);
			if (p[0] === 'switch' || p[0] === 'drag') {
				this.log(roomid, `${this.who(room, pos)} sent out ${species}!`);
			} else {
				this.log(roomid, `${species} changed forme!`);
			}
			this.render(roomid);
			break;
		}
		case '-damage': case '-heal': case '-sethp': {
			const mon = this.mon(room, p[1].split(':')[0]);
			this.setHP(mon, p[2]);
			this.render(roomid);
			break;
		}
		case '-status': {
			const mon = this.mon(room, p[1].split(':')[0]);
			mon.status = p[2];
			this.log(roomid, `${mon.species} was afflicted with ${p[2].toUpperCase()}.`);
			this.render(roomid);
			break;
		}
		case '-curestatus': {
			const mon = this.mon(room, p[1].split(':')[0]);
			mon.status = '';
			this.render(roomid);
			break;
		}
		case 'faint': {
			const pos = p[1].split(':')[0];
			const mon = this.mon(room, pos);
			mon.fainted = true;
			mon.hp = 0;
			if (pos.slice(0, 2) !== room.mySide) {
				// Everything of yours that is out shares the experience, which is
				// how the games have counted participants since Gen 5.
				room.knockouts.push({
					species: mon.species,
					level: mon.level || 100,
					participants: (room.active[room.mySide] || [])
						.filter(active => active && !active.fainted).map(active => active.species),
				});
			}
			this.log(roomid, `${mon.species} fainted!`, 'faint');
			this.render(roomid);
			break;
		}
		case 'move':
			this.log(roomid, `${p[1].split(': ')[1] || p[1]} used ${p[2]}!`);
			break;
		case '-mega': {
			const mon = this.mon(room, p[1].split(':')[0]);
			mon.mega = true;
			this.log(roomid,
				`${p[2]} Mega Evolved${p[3] && p[3] !== 'Mega Evolution' ? ` using ${p[3]}` : ''}!`, 'turn');
			this.render(roomid);
			break;
		}
		case '-supereffective': this.log(roomid, `It's super effective!`); break;
		case '-resisted': this.log(roomid, `It's not very effective…`); break;
		case '-crit': this.log(roomid, `A critical hit!`); break;
		case '-immune': this.log(roomid, `It had no effect.`); break;
		case '-weather':
			if (p[1] !== 'none') this.log(roomid, `Weather: ${p[1]}`, 'sys');
			break;
		case '-fieldstart': case '-fieldend': case '-sidestart': case '-sideend': {
			// `|-sidestart|p1: Name|move: Spikes` -> "Spikes started on your side."
			const name = (p[p.length - 1] || '').replace(/^(move|ability|item):\s*/, '');
			const gone = p[0].endsWith('end');
			const where = p[0].includes('side') ?
				` on ${(p[1] || '').startsWith(room.mySide) ? 'your' : 'the opposing'} side` : '';
			this.log(roomid, `${name}${where} ${gone ? 'wore off' : 'started'}.`, 'sys');
			break;
		}
		case '-boost': case '-unboost': {
			const mon = this.mon(room, p[1].split(':')[0]);
			this.log(roomid, `${mon.species}'s ${p[2].toUpperCase()} ` +
			`${p[0] === '-boost' ? 'rose' : 'fell'} by ${p[3]}.`);
			break;
		}
		case '-ability':
			this.log(roomid, `${p[1].split(': ')[1] || p[1]}'s ${p[2]} took effect!`, 'sys');
			break;
		case '-item': case '-enditem':
			this.log(roomid, `${p[1].split(': ')[1] || p[1]}: ${p[2]}`, 'sys');
			break;
		case '-message': case 'message':
			this.log(roomid, p.slice(1).join(' '), 'sys');
			break;
		case 'win':
			this.log(roomid, `${p[1]} won the battle!`, 'win');
			room.request = null;
			this.renderControls(roomid);
			this.showRewards(roomid, p[1]);
			break;
		case 'tie':
			this.log(roomid, `The battle ended in a tie.`, 'win');
			break;
		case 'request': {
			if (!p[1]) break;
			try { room.request = JSON.parse(p.slice(1).join('|')); } catch { break; }
			room.mega = false;
			room.pendingMove = null;
			room.choices = [];
			this.renderControls(roomid);
			break;
		}
		case 'error':
			this.log(roomid, p.slice(1).join(' '), 'faint');
			this.renderControls(roomid);
			break;
		}
	},
	/**
	 * The win screen: what this battle would have been worth in a real game.
	 * Nothing is stored or spent - it is shown because it is the number a
	 * trainer would care about.
	 */
	showRewards(roomid, winner) {
		const room = this.rooms[roomid];
		if (!room || room.rewardsShown) return;
		room.rewardsShown = true;
		const mine = room.sides[room.mySide]?.name;
		if (mine && winner && toID(winner) !== toID(mine)) return;
		if (!room.knockouts.length) return;

		const earned = new Map();
		for (const species of room.roster) earned.set(species, 0);
		for (const ko of room.knockouts) {
			const participants = ko.participants.length || 1;
			for (const species of ko.participants) {
				const level = room.levels[species] || 100;
				earned.set(species, (earned.get(species) || 0) +
				REWARDS.exp(ko.species, ko.level, level, participants));
			}
		}
		const lastLevel = room.knockouts[room.knockouts.length - 1].level;
		const money = REWARDS.prizeMoney(lastLevel);

		const box = el('div', 'rewards');
		box.appendChild(el('h3', null, 'Spoils'));
		const table = el('table');
		const head = el('tr');
		for (const label of ['Pokémon', 'Level', 'EXP']) head.appendChild(el('th', null, label));
		table.appendChild(head);
		for (const [species, exp] of earned) {
			if (!exp) continue;
			const row = el('tr');
			row.append(
				el('td', null, species),
				el('td', null, `L${room.levels[species] || 100}`),
				el('td', null, `${exp}`)
			);
			table.appendChild(row);
		}
		box.appendChild(table);
		box.appendChild(el('div', 'statline', `Prize money: ₽${money}`));
		box.appendChild(el('div', 'hint',
			'Worked out with the normal Pokémon formulas; nothing is saved between battles.'));
		room.node.querySelector('.controls').appendChild(box);
	},
	title(roomid) {
		const room = this.rooms[roomid];
		const foe = room.mySide === 'p1' ? 'p2' : 'p1';
		room.node.querySelector('.battle-title').textContent =
			`${room.sides[room.mySide].name || 'You'} vs ${room.sides[foe].name || '???'}`;
		room.node.querySelector('[data-side="foe"] h3').textContent =
			room.sides[foe].name || 'Opponent';
		room.node.querySelector('[data-side="me"] h3').textContent =
			room.sides[room.mySide].name || 'You';
	},
	mon(room, pos) {
		const side = pos.slice(0, 2);
		const slot = pos.charCodeAt(2) - 97;
		room.active[side] = room.active[side] || [];
		if (!room.active[side][slot]) room.active[side][slot] = { species: '?', hp: 100, maxhp: 100 };
		return room.active[side][slot];
	},
	who(room, pos) {
		return room.sides[pos.slice(0, 2)].name || pos;
	},
	setHP(mon, condition) {
		if (!condition) return;
		if (condition.includes('fnt')) {
			mon.hp = 0;
			mon.fainted = true;
			return;
		}
		const [hp, status] = condition.split(' ');
		const [cur, max] = hp.split('/').map(Number);
		mon.hp = cur;
		mon.maxhp = max || 100;
		if (status) mon.status = status;
	},

	render(roomid) {
		const room = this.rooms[roomid];
		const foe = room.mySide === 'p1' ? 'p2' : 'p1';
		this.renderSide(room, foe, room.node.querySelector('[data-side="foe"] .active-row'), true);
		this.renderSide(room, room.mySide, room.node.querySelector('[data-side="me"] .active-row'), false);
	},
	renderSide(room, side, container, isFoe) {
		container.innerHTML = '';
		(room.active[side] || []).forEach((mon, slot) => {
			if (!mon) return;
			const card = el('div', `mon${mon.fainted ? ' fainted' : ''}`);
			const head = el('div', 'mon-head');
			head.appendChild(img(ART.pokemon(mon.species), mon.species));
			const info = el('div', 'grow');
			info.appendChild(el('div', 'mon-name', mon.species));
			const badges = el('div');
			const species = D.pokedex[toID(mon.species)];
			if (species) {
				for (const type of species.types) badges.appendChild(el('span', `type type-${type}`, type));
			}
			if (mon.mega) badges.appendChild(el('span', 'badge mega', 'MEGA'));
			if (mon.status) badges.appendChild(el('span', 'badge status', mon.status.toUpperCase()));
			info.appendChild(badges);
			head.appendChild(info);
			card.appendChild(head);

			const pct = Math.max(0, Math.round(mon.hp / (mon.maxhp || 100) * 100));
			const bar = el('div', `hpbar${pct <= 20 ? ' low' : pct <= 50 ? ' mid' : ''}`);
			const fill = el('div');
			fill.style.width = `${pct}%`;
			bar.appendChild(fill);
			card.append(bar, el('div', 'statline',
				mon.maxhp === 100 ? `${pct}%` : `${mon.hp}/${mon.maxhp}`));

			// Doubles targeting: click the Pokemon to aim at - a foe, or your own
			// partner. Showdown numbers your own side with negative slots.
			if (room.pendingMove && !mon.fainted &&
				isLegalTarget(room.pendingMove, isFoe, slot)) {
				card.classList.add('targetable');
				card.onclick = () => this.chooseTarget(room, isFoe ? slot + 1 : -(slot + 1));
			}
			container.appendChild(card);
		});
		if (!container.children.length) container.appendChild(el('div', 'hint', 'No active Pokémon.'));
	},

	renderControls(roomid) {
		const room = this.rooms[roomid];
		const box = room.node.querySelector('.controls');
		box.innerHTML = '';
		const request = room.request;
		if (!request) {
			box.appendChild(el('div', 'hint', 'Waiting…'));
			this.render(roomid);
			return;
		}
		if (request.wait) {
			box.appendChild(el('div', 'hint', 'Waiting for the opponent…'));
			return;
		}
		if (request.teamPreview) {
			box.appendChild(el('div', 'prompt', 'Team preview'));
			const go = el('button', 'primary', 'Start battle');
			go.onclick = () => this.choose(roomid, 'default');
			box.appendChild(go);
			return;
		}

		if (request.forceSwitch) {
			// Slots that do not have to switch are filled in automatically; if
			// that completes the turn, it is sent right away.
			if (this.submitIfReady(roomid)) {
				this.renderControls(roomid);
				return;
			}
			const grid = this.switchGrid(roomid, request, true, room);
			// Nothing left to send out for this slot: the only legal choice is pass.
			if (!grid.querySelector('button:not(:disabled)')) {
				this.choose(roomid, 'pass');
				return;
			}
			box.appendChild(el('div', 'prompt',
				this.slotPrompt(request, room, 'Choose a Pokémon to send out')));
			box.appendChild(grid);
			return;
		}
		if (!request.active) return;

		const index = room.choices.length;
		const active = request.active[index];
		const self = request.side.pokemon[index];
		// An empty or fainted slot takes no action: the server counts choices
		// against unfainted Pokemon, so it must be `pass`.
		if (!active || !self || self.condition.endsWith(' fnt') || active.commanding) {
			this.choose(roomid, 'pass');
			return;
		}
		const isDoubles = request.active.length > 1;

		if (isDoubles) {
			box.appendChild(el('div', 'prompt',
				this.slotPrompt(request, room, 'Choose a move')));
		}

		if (room.pendingMove) {
			const allyOnly = ['adjacentAlly', 'adjacentAllyOrSelf'].includes(room.pendingMove.target);
			const foeOnly = room.pendingMove.target === 'adjacentFoe';
			box.appendChild(el('div', 'prompt',
				allyOnly ? 'Click one of your own Pokémon to target' :
				foeOnly ? 'Click an opposing Pokémon to target' :
				'Click a Pokémon to target — your own partner counts'));
			const cancel = el('button', null, 'Cancel');
			cancel.onclick = () => {
				room.pendingMove = null;
				this.renderControls(roomid);
				this.render(roomid);
			};
			box.appendChild(cancel);
			this.render(roomid);
			return;
		}

		const moves = el('div', 'move-grid');
		(active.moves || []).forEach((move, i) => {
			const data = D.moves[move.id] || {};
			const btn = el('button', 'move-btn');
			btn.disabled = !!move.disabled;
			btn.appendChild(el('span', 'mv-name', move.move));
			btn.appendChild(el('span', 'mv-meta',
				`${data.type || ''} ${data.category || ''} · ` +
				`${data.basePower ? `Pow ${data.basePower} · ` : ''}` +
				`PP ${move.pp ?? data.pp ?? '-'}/${move.maxpp ?? data.pp ?? '-'}`));
			btn.title = data.desc || '';
			btn.onclick = () => {
				// The request's own target type decides whether a target is legal.
				const needsTarget = isDoubles && CHOOSABLE_TARGETS.includes(move.target);
				if (needsTarget) {
					room.pendingMove = { index: i + 1, target: move.target, slot: index };
					this.renderControls(roomid);
					this.render(roomid);
				} else {
					this.choose(roomid, `move ${i + 1}${room.mega ? ' mega' : ''}`);
				}
			};
			moves.appendChild(btn);
		});
		box.appendChild(moves);

		// Mega Evolution (spec 13): always visible, so the player can see whether
		// it is still available and what it will do.
		const megaBtn = el('button', 'mega-toggle');
		const canMega = !!active.canMegaEvo;
		megaBtn.disabled = !canMega;
		megaBtn.setAttribute('aria-pressed', String(room.mega));
		const speciesName = (self.details || '').split(',')[0];
		const mega = D.megas[toID(speciesName)];
		megaBtn.textContent = !canMega ? 'Mega Evolution used' :
			room.mega ? '★ Mega Evolution ARMED — pick a move' :
			mega && toID(self.item) === mega.stoneId ?
				`Mega Evolve into ${mega.forme} (${mega.ability})` :
				'Mega Evolve (+20 to all stats)';
		megaBtn.onclick = () => { room.mega = !room.mega; this.renderControls(roomid); };
		box.appendChild(megaBtn);

		if (!active.trapped && !active.maybeTrapped) {
			box.appendChild(el('h3', null, 'Switch'));
			box.appendChild(this.switchGrid(roomid, request, false, room));
		}
		this.render(roomid);
	},
	/** "Pokemon 2 of 2: ..." while collecting a doubles turn. */
	slotPrompt(request, room, text) {
		const total = request.forceSwitch ? request.forceSwitch.length : request.active.length;
		if (total < 2) return text;
		const mon = request.side.pokemon[room.choices.length];
		const name = (mon?.details || '').split(',')[0] || `Slot ${room.choices.length + 1}`;
		return `${name} (${room.choices.length + 1}/${total}): ${text}`;
	},
	switchGrid(roomid, request, forced, room) {
		const grid = el('div', 'switch-grid');
		const activeCount = request.forceSwitch ? request.forceSwitch.length : (request.active || []).length;
		// A Pokemon already chosen this turn cannot be sent out twice.
		const taken = new Set(room.choices
			.filter(choice => choice.startsWith('switch '))
			.map(choice => Number(choice.slice(7))));
		request.side.pokemon.forEach((mon, i) => {
			if (i < activeCount && !forced) return;
			const fainted = mon.condition.endsWith(' fnt');
			const btn = el('button');
			btn.disabled = fainted || i < activeCount || taken.has(i + 1);
			btn.textContent = `${(mon.details || '').split(',')[0]}${fainted ? ' (fnt)' : ''}`;
			btn.onclick = () => this.choose(roomid, `switch ${i + 1}`);
			grid.appendChild(btn);
		});
		return grid;
	},
	chooseTarget(room, slot) {
		const pending = room.pendingMove;
		room.pendingMove = null;
		const roomid = Object.keys(this.rooms).find(id => this.rooms[id] === room);
		this.choose(roomid, `move ${pending.index} ${slot}${room.mega ? ' mega' : ''}`);
	},
	choose(roomid, choice) {
		const room = this.rooms[roomid];
		const request = room.request;
		if (!request) return;
		if (request.teamPreview) {
			Net.sendTo(roomid, `/choose ${choice}|${request.rqid}`);
			room.request = null;
			this.renderControls(roomid);
			return;
		}
		room.choices.push(choice);
		// In doubles, wait until every active Pokemon has a choice.
		this.submitIfReady(roomid);
		this.renderControls(roomid);
		this.render(roomid);
	},
	/**
	 * Fill in `pass` for slots that need no choice and send the turn once every
	 * active Pokemon has one. Returns true if the turn was sent.
	 */
	submitIfReady(roomid) {
		const room = this.rooms[roomid];
		const request = room.request;
		if (!request) return false;
		if (request.forceSwitch) {
			while (room.choices.length < request.forceSwitch.length &&
				!request.forceSwitch[room.choices.length]) {
				room.choices.push('pass');
			}
		}
		const needed = request.forceSwitch ? request.forceSwitch.length : (request.active || []).length;
		if (room.choices.length < needed) return false;
		Net.sendTo(roomid, `/choose ${room.choices.join(', ')}|${request.rqid}`);
		room.request = null;
		room.choices = [];
		room.mega = false;
		return true;
	},
};

// =====================================================================
window.addEventListener('DOMContentLoaded', () => {
	Teams.load();
	UI.init();
	Net.connect();
});
