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
			// A command typed outside a room gets its answer as a PM from the
			// server, so this is where a refused battle arrives. Dropping it is
			// what made "the bot just won't fight" look like nothing happening.
			const reply = /^\/(error|text|raw|html)\s+([\s\S]*)$/.exec(body);
			if (reply) {
				if (reply[1] === 'error') UI.serverProblem(reply[2]);
				else UI.serverInfo(reply[2]);
				return;
			}
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
			UI.serverProblem(parts.slice(1).join('|'));
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
		} else if (cmd === 'error') {
			UI.serverProblem(parts.slice(1).join('|'));
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
		return {
			name: name || 'New team', format: 'singles',
			// How a bot handed this team plays it. 'free' is the normal AI;
			// 'fixed' means it leads with the top Pokemon, sends the next one
			// down whenever something faints, and never switches by choice.
			botOrder: 'free',
			sets: [this.blankSet()],
		};
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
			// The spread is packed exactly as it was built: the `Free Spreads`
			// rule means the server no longer guesses that a round EV total or
			// an uninvested Pokemon was an import mistake, so nothing has to be
			// nudged behind the player's back.
			const packedEvs = STATS.map(stat => set.evs[stat] || '').join(',');
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
		// A team-level line, written before the first Pokemon. Other clients
		// ignore a label they do not know, and this one comes back on import.
		const header = team.botOrder === 'fixed' ? 'Bot Order: Fixed\n\n' : '';
		return header + team.sets.filter(set => set.species).map(set => {
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
		let botOrder = 'free';
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
			// Team-level settings are read whether or not a Pokemon is open, so
			// the line survives being moved around in the text.
			if (labelled && labelled[1].trim().toLowerCase() === 'bot order') {
				botOrder = /fixed/i.test(labelled[2]) ? 'fixed' : 'free';
				continue;
			}
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
		return { sets: sets.slice(0, 6), problems, botOrder };
	},

	/**
	 * Problems a player should fix before battling. This mirrors the rules the
	 * server enforces, so a team that passes here always starts a battle - a
	 * refusal the player cannot see is worse than no check at all.
	 * `format` is 'singles' | 'doubles' | 'random' | 'randomdoubles'.
	 */
	problems(team, format) {
		const out = [];
		const used = new Set();
		const sets = team.sets.filter(set => set.species);
		if (!sets.length) out.push('The team is empty - add at least one Pokémon.');
		// Doubles puts two Pokémon out at once, so one is not a team.
		if (sets.length === 1 && String(format || '').includes('doubles')) {
			out.push('Doubles needs at least 2 Pokémon on the team.');
		}
		for (const set of sets) {
			const id = toID(set.species);
			const species = D.pokedex[id];
			if (!species) { out.push(`${set.species} is not a Fakemon.`); continue; }
			// Fills in anything an older saved team is missing, so every check
			// below reads a complete set.
			this.migrate(set);
			if (species.battleOnly) out.push(`${species.name} is a Mega forme and cannot be on a team.`);
			if (used.has(id)) out.push(`${species.name} is on the team twice (Species Clause).`);
			used.add(id);
			const own = Object.values(species.abilities || {}).filter(Boolean);
			if (!set.ability) {
				out.push(`${species.name} has no ability.`);
			} else if (!own.some(name => toID(name) === toID(set.ability))) {
				out.push(`${species.name} cannot have ${set.ability} - it has ${own.join(', ')}.`);
			}
			const moves = set.moves.filter(Boolean);
			if (!moves.length) out.push(`${species.name} has no moves.`);
			const learnset = D.learnsets[id] || [];
			for (const move of moves) {
				if (!learnset.includes(toID(move))) {
					out.push(`${species.name} cannot learn ${D.moves[toID(move)]?.name || move}.`);
				}
			}
			const item = D.items[toID(set.item)];
			if (set.item && !item) out.push(`${species.name} is holding ${set.item}, which is not an item in this game.`);
			if (item && item.megaStone && !item.megaStone[species.name]) {
				out.push(`${item.name} belongs to ${Object.keys(item.megaStone).join('/')}, not ${species.name}.`);
			}
			const level = Number(set.level);
			if (!Number.isInteger(level) || level < 1 || level > 100) {
				out.push(`${species.name}'s level must be a whole number from 1 to 100.`);
			}
			// No item and one to three moves are both perfectly legal; only the
			// numbers that the server would reject are worth reporting.
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
				this.beginAction('#challenges');
				this.problem('Pick a name that does not start with "Guest".', []);
				return;
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
		$('#team-port-text').oninput = () => { this.portDirty = true; };
		$('#team-export').onclick = () => this.fillPort();
		$('#team-copy').onclick = async () => {
			this.fillPort();
			const text = $('#team-port-text');
			text.select();
			try {
				await navigator.clipboard.writeText(text.value);
				$('#team-port-result').innerHTML = `<div class="ok">Copied to the clipboard.</div>`;
			} catch {
				// No clipboard permission (or plain http): the text is selected,
				// so Ctrl+C still works.
				$('#team-port-result').innerHTML = `<div class="ok">Selected &mdash; press Ctrl+C.</div>`;
			}
		};
		$('#team-import').onclick = () => this.importPort(false);
		$('#team-import-new').onclick = () => this.importPort(true);
		$('#dex-search').oninput = () => this.renderDex();

		// Which checkout this page was built from, so a stale build is obvious.
		const build = D.build || {};
		$('#build-stamp').textContent =
			`${build.branch || '?'} @ ${build.commit || '?'} · built ${build.time || '?'}`;

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
	/**
	 * Where a server message about the last thing the player pressed should
	 * appear. Set by startBot/sendChallenge so a refused battle is reported
	 * next to the button that was pressed instead of in another panel.
	 */
	statusBox: '#challenges',
	/** Clears the box and remembers it as the place server replies go. */
	beginAction(boxId) {
		this.statusBox = boxId;
		const box = $(boxId);
		if (box) box.innerHTML = '';
		const other = $(boxId === '#bot-status' ? '#challenges' : '#bot-status');
		if (other && other.querySelector('.problem')) other.innerHTML = '';
	},
	/** Shows a problem in the current box. `lines` may be a string or a list. */
	problem(title, lines, boxId) {
		const box = $(boxId || this.statusBox);
		if (!box) return;
		const body = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
		box.innerHTML = `<div class="problem"><b>${escapeHTML(title)}</b>` +
			body.map(escapeHTML).join('<br />') + `</div>`;
	},
	/** Turns a protocol line into the sentence a player should read. */
	plain(text) {
		return String(text).replace(/^(error|popup|raw|html)\|/, '')
			.replace(/\|/g, ' ').replace(/\s*\n+\s*/g, ' ').trim();
	},
	/** The server refused something. This must never be silent. */
	serverProblem(text) {
		const line = this.plain(text);
		if (!line) return;
		console.log('[server]', line);
		const box = $(this.statusBox);
		if (!box) return;
		const previous = box.querySelector('.problem');
		if (previous) {
			// A second message about the same click adds to the first one
			// instead of hiding it (e.g. "team not stored" then "no team").
			previous.insertAdjacentHTML('beforeend', `<br />${escapeHTML(line)}`);
		} else {
			box.innerHTML = `<div class="problem"><b>The server refused that:</b>${escapeHTML(line)}</div>`;
		}
	},
	/** The server just told us something went fine. */
	serverInfo(text) {
		const line = this.plain(text);
		if (!line) return;
		console.log('[server]', line);
		const box = $(this.statusBox);
		// A success wipes the refusal that was on screen from the last try.
		if (box && box.querySelector('.problem')) box.innerHTML = '';
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
	useTeam(team, format, label) {
		// Random formats generate teams server-side; sending one would be ignored.
		if (format.startsWith('random')) {
			Net.send(`|/utm null`);
			return true;
		}
		const problems = Teams.problems(team, format);
		if (problems.length) {
			this.problem(label || `That team cannot battle yet:`, problems);
			return false;
		}
		Net.send(`|/utm ${Teams.pack(team)}`);
		return true;
	},
	startBot() {
		this.beginAction('#bot-status');
		const format = $('#bot-format').value;
		const team = this.selectedTeam('#bot-team');
		if (!this.useTeam(team, format, `Your team cannot battle yet:`)) return;
		const name = $('#bot-name').value.trim() || 'Fakemon Bot';
		const mode = $('#bot-teammode').value;
		const difficulty = $('#bot-difficulty').value;
		// "custom" means you built both sides: the bot's team is a packed team,
		// which is full of commas, so it goes in its own command first.
		if (mode === 'custom' && !format.startsWith('random')) {
			const botTeam = this.selectedTeam('#bot-own-team');
			const problems = Teams.problems(botTeam, format);
			if (problems.length) {
				this.problem(`The bot's team cannot battle yet:`, problems);
				return;
			}
			// Which of the bot's Pokemon it is allowed to Mega Evolve. With
			// exactly one named, it is guaranteed to use it.
			const megas = botTeam.sets.filter(set => set.species && set.mega)
				.map(set => toID(set.species));
			Net.send(`|/fakemonbotteam megas=${megas.join(',')};order=` +
				`${botTeam.botOrder === 'fixed' ? 'fixed' : 'free'};${Teams.pack(botTeam)}`);
		}
		setTimeout(() => {
			Net.send(`|/fakemonbot ${format}, ${name}, ${mode}, ${difficulty}`);
		}, 60);
	},
	sendChallenge() {
		this.beginAction('#challenges');
		const target = $('#pvp-name').value.trim();
		if (!target) return this.problem(`Enter a username to challenge.`, []);
		const format = $('#pvp-format').value;
		const team = this.selectedTeam('#pvp-team');
		if (!this.useTeam(team, format, `Your team cannot battle yet:`)) return;
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
				this.statusBox = '#challenges';
				if (!this.useTeam(this.selectedTeam('#pvp-team'), format, `Your team cannot battle yet:`)) return;
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
		// The handlers read `this.editing` when they fire rather than closing
		// over one team, so importing a different team into the editor cannot
		// leave them pointing at the old one.
		$('#team-name').oninput = e => { this.current().name = e.target.value; Teams.save(); };
		$('#team-format').onchange = e => { this.current().format = e.target.value; Teams.save(); };
		$('#team-bot-order').onchange = e => {
			this.current().botOrder = e.target.value;
			Teams.save();
			this.renderTeamEditor();
		};
		this.renderTeamEditor();
	},
	/** The team the editor is on right now. */
	current() {
		return Teams.all[this.editing];
	},
	renderTeamEditor() {
		const team = Teams.all[this.editing];
		// Re-read on every render, so an import shows the team it just loaded.
		$('#team-name').value = team.name;
		$('#team-format').value = team.format || 'singles';
		$('#team-bot-order').value = team.botOrder || 'free';
		while (team.sets.length < 6) team.sets.push(Teams.blankSet());
		team.sets.forEach(set => Teams.migrate(set));

		// A team may hold anything from one to six Pokemon; an empty slot is
		// simply left empty and is not sent to the server.
		const filled = team.sets.filter(set => set.species).length;
		const megas = team.sets.filter(set => set.species && set.mega).map(set => set.species);
		$('#team-count').innerHTML =
			`<strong>${filled} of 6 Pok&eacute;mon.</strong> Fewer than six is fine &mdash; ` +
			`leave a slot on &ldquo;&mdash;&rdquo; to skip it. No item and one to three moves ` +
			`are legal too.` +
			(megas.length ?
				`<br />Bot Mega Evolution: <strong>${megas.map(escapeHTML).join(', ')}</strong>` +
				(megas.length === 1 ? ' &mdash; guaranteed, because it is the only one marked.' :
				' &mdash; the bot picks one of them.') :
				'') +
				(team.botOrder === 'fixed' ?
					`<br />A bot given this team plays it <strong>top to bottom</strong> and ` +
					`never switches by choice. That travels with the copy/paste text as ` +
					`<code>Bot Order: Fixed</code>.` : '');
		const wrap = $('#team-slots');
		wrap.innerHTML = '';
		team.sets.forEach((set, i) => wrap.appendChild(this.renderSlot(team, set, i)));

		const problems = Teams.problems(team, team.format);
		$('#team-validation').innerHTML = problems.length ?
			`<div class="problem">${problems.map(escapeHTML).join('<br />')}</div>` :
			`<div class="ok">Team is legal.</div>`;
		// The export box always shows the team you are looking at, so it is never
		// out of date and never needs to be opened first.
		if (!this.portDirty) $('#team-port-text').value = Teams.export(team);
		this.refreshTeamPickers();
	},
	fillPort() {
		this.portDirty = false;
		$('#team-port-text').value = Teams.export(Teams.all[this.editing]);
		$('#team-port-result').textContent = '';
	},
	importPort(asNewTeam) {
		const { sets, problems, botOrder } = Teams.import($('#team-port-text').value);
		// Counted before rendering: the editor pads the team out to six slots,
		// and `sets` is the very array it pads.
		const imported = sets.length;
		const box = $('#team-port-result');
		if (!sets.length) {
			box.innerHTML = `<div class="problem">${problems.map(escapeHTML).join('<br />')}</div>`;
			return;
		}
		if (asNewTeam) {
			const team = Teams.blank(`Imported ${Teams.all.length + 1}`);
			team.sets = sets;
			team.botOrder = botOrder;
			Teams.all.push(team);
			this.editing = Teams.all.length - 1;
		} else {
			Teams.all[this.editing].sets = sets;
			Teams.all[this.editing].botOrder = botOrder;
		}
		Teams.save();
		this.portDirty = false;
		this.renderTeamEditor();
		this.refreshTeamPickers();
		box.innerHTML = problems.length ?
			`<div class="problem">Imported ${imported} Pokémon, with problems:<br />` +
			`${problems.map(escapeHTML).join('<br />')}</div>` :
			`<div class="ok">Imported ${imported} Pokémon.</div>`;
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
			const itemPicker = this.picker('Item', itemOptions(species), set.item, value => {
				set.item = value;
				Teams.save();
				this.renderTeamEditor();
			});
			// Show what the item looks like, so a held item is recognisable at a
			// glance here and in battle.
			const heldItem = D.items[toID(set.item)];
			if (heldItem) {
				const preview = el('div', 'item-preview');
				preview.append(img(ART.item(heldItem.name), heldItem.name),
					el('span', null, heldItem.desc || heldItem.name));
				itemPicker.appendChild(preview);
			}
			grid.appendChild(itemPicker);
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
				this.statRow('EVs', set, 'evs', 0, EV_MAX_PER_STAT, species),
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
				'The bot may Mega Evolve this one — exported as "(M)". ' +
				'On your own team it has no effect: everything of yours can Mega Evolve anyway.'));
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
				let value = Math.max(min, Math.min(max, Math.round(Number(input.value) || 0)));
				if (key === 'evs') {
					// Never let the box go over the total; the leftover is what is
					// still free, so typing 252 into a fourth stat clamps instead
					// of quietly making the team illegal.
					const others = STATS.reduce((sum, other) =>
						sum + (other === stat ? 0 : set.evs[other] || 0), 0);
					value = Math.min(value, Math.max(0, EV_LIMIT - others));
					if (String(value) !== input.value) input.value = String(value);
				}
				set[key][stat] = value;
				refreshTotal();
				Teams.save();
			};
			// Re-render once the field is left, so the stat line catches up.
			input.onchange = () => this.renderTeamEditor();
			cell.appendChild(input);
			grid.appendChild(cell);
		}
		wrap.append(el('div', 'statline',
			key === 'evs' ? `${label} (max ${EV_MAX_PER_STAT} per stat, ${EV_LIMIT} total)` :
			`${label} (0-31)`), grid);
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
/**
 * 252 per stat and 508 in total: 508 is what is actually spendable, since EVs
 * only count in fours. The server's own limit is 510, so anything the builder
 * accepts is always legal there too.
 */
const EV_LIMIT = 508;
const EV_MAX_PER_STAT = 252;

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

// The battle room itself lives in battle.js, which is loaded after this file.

// What battle.js (loaded after this file) reaches for. Naming it here keeps
// the boundary between the two files explicit rather than implied.
Object.assign(window, {
	D, ART, img, el, $, toID, escapeHTML,
	STATS, STAT_LABEL, NATURES, finalStat,
	CHOOSABLE_TARGETS, isLegalTarget, REWARDS,
});

// =====================================================================
window.addEventListener('DOMContentLoaded', () => {
	Teams.load();
	UI.init();
	Net.connect();
});
