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
		return { species: '', ability: '', item: '', moves: ['', '', '', ''], spread: 'auto' };
	},
	/**
	 * EV spread and nature. The source files say nothing about EVs, so a set gets
	 * a sensible competitive spread; `auto` picks one from the base stats.
	 * The validator rejects a set with no EVs at all, so this is not optional.
	 */
	spreadFor(species, set) {
		let spread = set.spread || 'auto';
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
			const moves = set.moves.filter(Boolean).map(toID).join(',');
			const { nature, evs } = this.spreadFor(species, set);
			const packedEvs = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
				.map(stat => evs[stat] || '').join(',');
			// name|species|item|ability|moves|nature|evs|gender|ivs|shiny|level|happiness
			return [
				species.name, '', toID(set.item), toID(set.ability), moves,
				nature, packedEvs, '', '', '', '', '',
			].join('|');
		}).filter(Boolean).join(']');
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
		for (const id of ['#bot-team', '#pvp-team']) {
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
		const wrap = $('#team-slots');
		wrap.innerHTML = '';
		team.sets.forEach((set, i) => wrap.appendChild(this.renderSlot(team, set, i)));

		const problems = Teams.problems(team);
		$('#team-validation').innerHTML = problems.length ?
			`<div class="problem">${problems.map(escapeHTML).join('<br />')}</div>` :
			`<div class="ok">Team is legal.</div>`;
		this.refreshTeamPickers();
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
			grid.appendChild(this.picker('EV spread', [
				['auto', 'Auto (from base stats)'],
				['physical', 'Physical sweeper'],
				['special', 'Special sweeper'],
				['fast', 'Fast attacker'],
				['bulky', 'Bulky wall'],
			], set.spread || 'auto', value => {
				set.spread = value;
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
			const { nature, evs } = Teams.spreadFor(species, set);
			slot.appendChild(el('div', 'statline',
				`HP ${stats.hp} · Atk ${stats.atk} · Def ${stats.def} · ` +
				`SpA ${stats.spa} · SpD ${stats.spd} · Spe ${stats.spe} · BST ${bst}`));
			slot.appendChild(el('div', 'statline', `${nature} · EVs ` +
			Object.entries(evs).map(([stat, value]) => `${value} ${stat.toUpperCase()}`).join(' / ')));

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
			Object.assign(mon, { species, nick, hp: 100, maxhp: 100, status: '', fainted: false });
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
			const mon = this.mon(room, p[1].split(':')[0]);
			mon.fainted = true;
			mon.hp = 0;
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
		case '-fieldstart': case '-fieldend': case '-sidestart': case '-sideend':
			this.log(roomid, line.slice(1).replace(/\|/g, ' '), 'sys');
			break;
		case '-boost': case '-unboost': {
			const mon = this.mon(room, p[1].split(':')[0]);
			this.log(roomid, `${mon.species}'s ${p[2].toUpperCase()} ` +
			`${p[0] === '-boost' ? 'rose' : 'fell'} by ${p[3]}.`);
			break;
		}
		case '-ability':
			this.log(roomid, `${p[1].split(': ')[1] || p[1]}: ${p[2]}`, 'sys');
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

			// Doubles targeting: click an opposing Pokemon to aim at it.
			if (isFoe && room.pendingMove) {
				card.classList.add('targetable');
				card.onclick = () => this.chooseTarget(room, slot + 1);
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
			box.appendChild(el('div', 'prompt', 'Click an opposing Pokémon to target'));
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
				const needsTarget = isDoubles &&
					['normal', 'any', 'adjacentFoe'].includes(move.target);
				if (needsTarget) {
					room.pendingMove = i + 1;
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
		const index = room.pendingMove;
		room.pendingMove = null;
		const roomid = Object.keys(this.rooms).find(id => this.rooms[id] === room);
		this.choose(roomid, `move ${index} ${slot}${room.mega ? ' mega' : ''}`);
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
