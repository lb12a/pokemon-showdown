/**
 * The battle room.
 *
 * The server sends a whole turn at once. Showing all of it immediately would be
 * a wall of text with nothing to watch, so nothing here is applied on arrival:
 * every protocol line is turned into one or more *steps* and queued, and a
 * player drains that queue at a readable pace, running each step's animation and
 * writing its sentence into the log at the bottom of the screen.
 *
 * That means three rules hold everywhere in this file:
 *
 *   1. A handler may only *queue*. Anything that changes what is on screen goes
 *      inside a step's `run`, so the picture and the text never disagree.
 *   2. Every line the sim can send gets a sentence. If something happens and the
 *      log is silent about it, that is a bug.
 *   3. Controls appear only once the queue is empty, so you never choose a move
 *      while the previous turn is still playing.
 */
'use strict';

// =====================================================================
// Pacing
// =====================================================================
/** Milliseconds a step of each kind holds the screen, before the speed factor. */
const BEAT = {
	turn: 750,
	move: 420,
	hit: 620,
	minor: 560,
	major: 900,
	switchIn: 260,
	faint: 520,
	end: 1400,
};
const SPEEDS = { slow: 1.5, normal: 1, fast: 0.55, instant: 0 };

// =====================================================================
// Small helpers
// =====================================================================
/** `move: Stealth Rock` -> `Stealth Rock`; `ability: Levitate` -> `Levitate`. */
function effectName(raw) {
	return String(raw || '').replace(/^[a-z]+:\s*/, '').trim();
}
/** `p2a: Nickname` -> `p2a`. */
function posOf(raw) {
	return String(raw || '').split(':')[0].trim();
}
/** `p2a: Nickname` -> `Nickname`. */
function nickOf(raw) {
	const parts = String(raw || '').split(': ');
	return (parts[1] || parts[0] || '').trim();
}
/** The `[from] x` / `[of] y` tail every minor message may carry. */
function kwargs(parts) {
	const out = {};
	for (const part of parts) {
		const match = /^\[([a-z]+)\]\s*(.*)$/.exec(String(part).trim());
		if (match) out[match[1]] = match[2];
	}
	return out;
}
const STAT_NAME = {
	atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def',
	spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness', hp: 'HP',
};
const STATUS_NAME = {
	brn: 'burned', par: 'paralyzed', slp: 'asleep', frz: 'frozen',
	psn: 'poisoned', tox: 'badly poisoned',
};
const STAGE_WORD = ['', 'rose', 'rose sharply', 'rose drastically'];
const DROP_WORD = ['', 'fell', 'harshly fell', 'severely fell'];

/**
 * The window a stat can fall in at this level, from a Pokemon with no
 * investment and a hindering nature up to a fully invested, boosted one. The
 * opponent's exact numbers are never shown - only what they could be.
 */
function statSpread(stat, base, level) {
	if (stat === 'hp') {
		if (base === 1) return [1, 1];
		return [
			Math.floor(2 * base * level / 100) + level + 10,
			Math.floor((2 * base + 31 + 63) * level / 100) + level + 10,
		];
	}
	return [
		Math.floor((Math.floor(2 * base * level / 100) + 5) * 0.9),
		Math.floor((Math.floor((2 * base + 31 + 63) * level / 100) + 5) * 1.1),
	];
}

// =====================================================================
// Hover cards
// =====================================================================
const Tip = {
	node: null,
	show(anchor, html) {
		this.hide();
		const box = el('div', 'tip');
		box.innerHTML = html;
		document.body.appendChild(box);
		this.node = box;
		const a = anchor.getBoundingClientRect();
		const b = box.getBoundingClientRect();
		let left = a.left + a.width / 2 - b.width / 2;
		let top = a.top - b.height - 10;
		if (top < 8) top = a.bottom + 10;
		left = Math.max(8, Math.min(left, window.innerWidth - b.width - 8));
		box.style.left = `${left}px`;
		box.style.top = `${top}px`;
	},
	hide() {
		if (this.node) this.node.remove();
		this.node = null;
	},
	/** Wire an element so hovering (or focusing) it shows `build()`. */
	bind(node, build) {
		node.addEventListener('mouseenter', () => this.show(node, build()));
		node.addEventListener('mouseleave', () => this.hide());
		node.addEventListener('focus', () => this.show(node, build()));
		node.addEventListener('blur', () => this.hide());
		node.tabIndex = node.tabIndex >= 0 ? node.tabIndex : 0;
	},
};
window.addEventListener('scroll', () => Tip.hide(), true);

/** Type chips, shared by every card. */
function typeChips(types) {
	return (types || []).map(t => `<span class="type type-${t}">${t}</span>`).join('');
}

// =====================================================================
// Battle
// =====================================================================
const Battle = {
	rooms: {},
	speed: (() => {
		try { return localStorage.getItem('fakemon-speed') || 'normal'; } catch { return 'normal'; }
	})(),

	open(roomid) {
		if (this.rooms[roomid]) return;
		const node = el('div', 'panel battle-panel');
		node.id = `room-${roomid}`;
		node.innerHTML = `
			<div class="battle-head">
				<h2 class="battle-title">Battle</h2>
				<label class="speed">Speed
					<select class="speed-picker">
						<option value="slow">Slow</option>
						<option value="normal">Normal</option>
						<option value="fast">Fast</option>
						<option value="instant">Instant</option>
					</select>
				</label>
			</div>
			<div class="battle-scene">
				<div class="scene-sky"></div>
				<div class="scene-ground"></div>
				<div class="field-row foe"></div>
				<div class="field-row mine"></div>
				<div class="field-tags"></div>
			</div>
			<div class="battle-controls"></div>
			<div class="battle-log-wrap">
				<div class="battle-log" aria-live="polite"></div>
			</div>`;
		$('#battles').prepend(node);

		const scene = node.querySelector('.battle-scene');
		const room = {
			roomid, node, scene,
			fx: BattleFX.mount(scene),
			sides: { p1: {}, p2: {} },
			mySide: 'p1',
			active: { p1: [], p2: [] },
			/** What has been revealed about each species, per side. */
			known: { p1: {}, p2: {} },
			/** Field state, so it can be shown as tags and explained on hover. */
			field: { weather: '', terrain: '', pseudo: {}, sides: { p1: {}, p2: {} } },
			queue: [],
			playing: false,
			request: null,
			pendingRequest: undefined,
			mega: false,
			pendingMove: null,
			choices: [],
			knockouts: [],
			levels: {},
			roster: [],
			ended: false,
		};
		this.rooms[roomid] = room;

		const picker = node.querySelector('.speed-picker');
		picker.value = this.speed;
		picker.onchange = () => {
			this.speed = picker.value;
			try { localStorage.setItem('fakemon-speed', this.speed); } catch {}
		};
		this.renderField(room);
		UI.show('battle');
	},

	close(roomid) {
		const room = this.rooms[roomid];
		if (room) {
			room.fx.destroy();
			room.node.remove();
		}
		delete this.rooms[roomid];
		Tip.hide();
	},

	// -----------------------------------------------------------------
	// The queue
	// -----------------------------------------------------------------
	/** Queue one step. `run` may return a promise; the player waits for it. */
	push(room, step) {
		room.queue.push(step);
		this.play(room);
	},
	/** A step that only writes a line in the log. */
	say(room, text, cls, hold) {
		if (!text) return;
		this.push(room, { text, cls, hold: hold || BEAT.minor });
	},

	async play(room) {
		if (room.playing) return;
		room.playing = true;
		const factor = SPEEDS[this.speed] ?? 1;
		while (room.queue.length) {
			const step = room.queue.shift();
			try {
				if (step.text) this.log(room, step.text, step.cls);
				// (a step with no text is an animation-only beat)
				const result = step.run ? step.run(room) : null;
				if (result && typeof result.then === 'function' && factor > 0) await result;
			} catch (err) {
				// A broken animation must never stop the battle from playing on.
				console.error('battle step failed', err);
			}
			const hold = (step.hold ?? BEAT.minor) * factor;
			if (hold > 0) await new Promise(done => { setTimeout(done, hold); });
		}
		room.playing = false;
		// Controls were held back while the turn was playing.
		if (room.pendingRequest !== undefined) {
			room.request = room.pendingRequest;
			room.pendingRequest = undefined;
			room.mega = false;
			room.pendingMove = null;
			room.choices = [];
			this.renderControls(room);
		}
	},

	log(room, text, cls) {
		const box = room.node.querySelector('.battle-log');
		const prev = box.lastElementChild;
		if (prev) prev.classList.remove('fresh');
		const line = el('div', `log-line${cls ? ` ${cls}` : ''} fresh`, text);
		box.appendChild(line);
		box.scrollTop = box.scrollHeight;
		while (box.children.length > 400) box.firstElementChild.remove();
	},

	// -----------------------------------------------------------------
	// State lookups
	// -----------------------------------------------------------------
	mon(room, pos) {
		const side = pos.slice(0, 2);
		const slot = pos.charCodeAt(2) - 97;
		room.active[side] = room.active[side] || [];
		if (!room.active[side][slot]) {
			room.active[side][slot] = {
				species: '?', nick: '?', level: 100, hp: 100, maxhp: 100,
				status: '', fainted: false, mega: false, boosts: {}, volatiles: {},
				side, slot,
			};
		}
		const mon = room.active[side][slot];
		mon.side = side;
		mon.slot = slot;
		return mon;
	},
	/** The persistent record of what has been seen of a species. */
	knownOf(room, mon) {
		const book = room.known[mon.side] || (room.known[mon.side] = {});
		const id = toID(mon.species);
		return book[id] || (book[id] = { moves: [], ability: '', item: '', species: mon.species });
	},
	who(room, pos) {
		return room.sides[pos.slice(0, 2)]?.name || pos;
	},
	/** "Tigraith" for yours, "the opposing Tigraith" for theirs - like Showdown. */
	label(room, pos) {
		const mon = this.mon(room, posOf(pos));
		return posOf(pos).slice(0, 2) === room.mySide ?
			this.nameOf(mon) : `the opposing ${this.nameOf(mon)}`;
	},
	/**
	 * What to call a Pokemon. A real nickname is shown with its species after
	 * it; a forme is not a nickname, so "Tigraxe" holding forme
	 * "Tigraxe-Hyperaxed" stays one name rather than two.
	 */
	nameOf(mon) {
		const nick = mon.nick || mon.species;
		if (nick === mon.species) return mon.species;
		if (toID(mon.species).startsWith(toID(nick))) return mon.species;
		return `${nick} (${mon.species})`;
	},
	isMine(room, pos) {
		return posOf(pos).slice(0, 2) === room.mySide;
	},
	setHP(mon, condition) {
		if (!condition) return;
		if (String(condition).includes('fnt')) {
			mon.hp = 0;
			mon.fainted = true;
			return;
		}
		const [hp, status] = String(condition).split(' ');
		const [cur, max] = hp.split('/').map(Number);
		if (!isNaN(cur)) mon.hp = cur;
		if (max) mon.maxhp = max;
		mon.status = status || '';
	},
	/** The sprite element of a position, for animations. */
	spriteOf(room, pos) {
		return room.node.querySelector(`.field-slot[data-pos="${posOf(pos)}"] .sprite-wrap`);
	},

	// -----------------------------------------------------------------
	// Protocol
	// -----------------------------------------------------------------
	line(roomid, line) {
		if (!this.rooms[roomid]) this.open(roomid);
		const room = this.rooms[roomid];
		if (!line.startsWith('|')) return;
		const p = line.slice(1).split('|');
		const kw = kwargs(p.slice(2));
		const cmd = p[0];
		// The sim marks a message it does not want narrated. Those still change
		// state, so they are handled below - they just do not get a sentence.
		const silent = kw.silent !== undefined;

		// A message that says where it came from reads much better with that
		// reason attached: "... from its Sugar Berry", "... from Stealth Rock".
		const because = () => {
			const from = effectName(kw.from);
			if (!from || from === 'Recoil') return '';
			return ` from ${from}`;
		};

		switch (cmd) {
		// ---------------------------------------------------- setup ------
		case 'player':
			if (p[2] && toID(p[2]) === toID(Net.name)) room.mySide = p[1];
			if (p[2]) room.sides[p[1]] = { ...room.sides[p[1]], name: p[2] };
			this.title(room);
			this.renderField(room);
			return;
		case 'teamsize':
			room.sides[p[1]] = { ...room.sides[p[1]], size: Number(p[2]) };
			return;
		case 'gametype':
			room.gameType = p[1];
			return;
		case 'tier':
			room.tier = p[1];
			this.title(room);
			return;
		case 'rule':
			this.say(room, p[1], 'sys', BEAT.switchIn);
			return;
		case 'clearpoke': case 'poke': case 'teampreview':
			return;
		case 'start':
			this.say(room, `The battle begins!`, 'turn', BEAT.turn);
			return;
		case 'turn':
			this.push(room, {
				text: `— Turn ${p[1]} —`, cls: 'turn', hold: BEAT.turn,
				run: r => { r.turn = Number(p[1]); this.renderField(r); },
			});
			return;
		case 'upkeep': case 'done': case 'inactiveoff': case 'expire':
			return;
		case 'inactive':
			this.say(room, p[1], 'sys', BEAT.switchIn);
			return;

		// -------------------------------------------------- switching ----
		case 'switch': case 'drag': case 'replace': case 'detailschange': {
			const pos = posOf(p[1]);
			const nick = nickOf(p[1]);
			const details = p[2] || '';
			const species = details.split(',')[0].trim();
			const level = Number(/L(\d+)/.exec(details)?.[1]) || 100;
			const gender = /,\s*([MF])\b/.exec(details)?.[1] || '';
			const forme = cmd === 'detailschange';
			const mine = pos.slice(0, 2) === room.mySide;
			const before = this.mon(room, pos).species;

			const text = forme ?
				`${this.label(room, p[1])} transformed into ${species}!` :
				cmd === 'drag' ?
					`${this.label(room, p[1])} was dragged out!` :
					`${this.who(room, pos)} sent out ${species}!`;

			this.push(room, {
				text, cls: forme ? 'sys' : 'switch', hold: BEAT.switchIn,
				run: r => {
					const mon = this.mon(r, pos);
					const wasOut = mon.species !== '?' && mon.species !== species && !forme;
					Object.assign(mon, {
						species, nick: nick || species, level, gender,
						status: forme ? mon.status : '',
						fainted: false,
						boosts: forme ? mon.boosts : {},
						volatiles: forme ? mon.volatiles : {},
					});
					if (!forme) {
						mon.hp = 100;
						mon.maxhp = 100;
						mon.mega = false;
					}
					this.setHP(mon, p[3]);
					r.levels[species] = level;
					if (mine && !r.roster.includes(species)) r.roster.push(species);
					this.knownOf(r, mon);
					this.renderField(r);
					const node = this.spriteOf(r, pos);
					if (forme) return BattleFX.mega(r.fx, node);
					if (wasOut || before === '?') return BattleFX.sendOut(r.fx, node);
					return BattleFX.sendOut(r.fx, node);
				},
			});
			return;
		}
		case 'swap': {
			this.say(room, `${this.label(room, p[1])} moved position.`, 'sys', BEAT.switchIn);
			this.push(room, { run: r => this.renderField(r), hold: 0 });
			return;
		}
		case 'faint': {
			const pos = posOf(p[1]);
			this.push(room, {
				text: `${this.label(room, p[1])} fainted!`, cls: 'faint', hold: BEAT.faint,
				run: r => {
					const mon = this.mon(r, pos);
					mon.fainted = true;
					mon.hp = 0;
					if (pos.slice(0, 2) !== r.mySide) {
						r.knockouts.push({
							species: mon.species, level: mon.level || 100,
							participants: (r.active[r.mySide] || [])
								.filter(a => a && !a.fainted).map(a => a.species),
						});
					}
					const node = this.spriteOf(r, pos);
					const done = BattleFX.faint(r.fx, node);
					return done.then(() => this.renderField(r));
				},
			});
			return;
		}

		// ------------------------------------------------------ moves ----
		case 'move': {
			const move = p[2];
			const data = D.moves[toID(move)];
			const from = posOf(p[1]);
			const target = p[3] && p[3] !== 'null' ? posOf(p[3]) : '';
			const extra = kw.from ? ` (from ${effectName(kw.from)})` : '';
			this.push(room, {
				text: `${this.label(room, p[1])} used ${move}!${extra}`, cls: 'move',
				hold: BEAT.move,
				run: r => {
					const mon = this.mon(r, from);
					const book = this.knownOf(r, mon);
					if (!book.moves.includes(move)) book.moves.push(move);
					this.renderField(r);
					return BattleFX.attack(
						r.fx, this.spriteOf(r, from), this.spriteOf(r, target || from),
						data?.type || 'Normal', data?.category || 'Status'
					);
				},
			});
			return;
		}
		case '-anim': {
			const data = D.moves[toID(p[2])];
			const from = posOf(p[1]);
			const target = p[3] ? posOf(p[3]) : from;
			this.push(room, {
				hold: 0,
				run: r => BattleFX.attack(r.fx, this.spriteOf(r, from), this.spriteOf(r, target),
					data?.type || 'Normal', data?.category || 'Status'),
			});
			return;
		}
		case 'cant': {
			const reason = effectName(p[2]);
			const move = p[3] ? ` ${p[3]}` : '';
			const texts = {
				slp: `${this.label(room, p[1])} is fast asleep.`,
				frz: `${this.label(room, p[1])} is frozen solid!`,
				par: `${this.label(room, p[1])} is paralyzed and can't move!`,
				flinch: `${this.label(room, p[1])} flinched and couldn't move!`,
				recharge: `${this.label(room, p[1])} must recharge!`,
				'Focus Punch': `${this.label(room, p[1])} lost its focus and couldn't move!`,
				nopp: `${this.label(room, p[1])} has no PP left for${move}!`,
				Taunt: `${this.label(room, p[1])} can't use${move} after the taunt!`,
				Disable: `${this.label(room, p[1])} can't use${move} - it is disabled!`,
				Truant: `${this.label(room, p[1])} is loafing around!`,
			};
			this.say(room, texts[reason] ||
			`${this.label(room, p[1])} couldn't move${move ? ` (${reason})` : ''}!`,
			'sys', BEAT.hit);
			return;
		}
		case '-fail': {
			const what = effectName(p[2]);
			this.say(room, what ?
				`${this.label(room, p[1])}'s ${what} failed!` :
				`But it failed!`, 'sys', BEAT.hit);
			return;
		}
		case '-block':
			this.say(room, `${this.label(room, p[1])} was protected by ${effectName(p[2])}!`,
				'sys', BEAT.hit);
			return;
		case '-notarget':
			this.say(room, `But there was no target…`, 'sys', BEAT.hit);
			return;
		case '-miss':
			this.push(room, {
				text: p[2] ? `${this.label(room, p[2])} avoided the attack!` :
				`${this.label(room, p[1])}'s attack missed!`,
				cls: 'sys', hold: BEAT.hit,
				run: r => BattleFX.shake(this.spriteOf(r, p[2] || p[1]), 6),
			});
			return;
		case '-ohko':
			this.say(room, `It's a one-hit KO!`, 'crit', BEAT.hit);
			return;
		case '-crit':
			this.say(room, `A critical hit!`, 'crit', BEAT.hit);
			return;
		case '-supereffective':
			this.say(room, `It's super effective!`, 'good', BEAT.hit);
			return;
		case '-resisted':
			this.say(room, `It's not very effective…`, 'sys', BEAT.hit);
			return;
		case '-immune':
			this.say(room, `It doesn't affect ${this.label(room, p[1])}…`, 'sys', BEAT.hit);
			return;
		case '-hitcount':
			this.say(room, `Hit ${p[2]} time${p[2] === '1' ? '' : 's'}!`, 'sys', BEAT.hit);
			return;
		case '-nothing':
			this.say(room, `But nothing happened!`, 'sys', BEAT.hit);
			return;
		case '-center':
			this.say(room, `Automatic center!`, 'sys', BEAT.switchIn);
			return;
		case '-combine':
			this.say(room, `The two moves combined into one!`, 'sys', BEAT.minor);
			return;
		case '-waiting':
			this.say(room, `${this.label(room, p[1])} is waiting for ${this.label(room, p[2])}…`,
				'sys', BEAT.minor);
			return;
		case '-prepare':
			this.say(room, `${this.label(room, p[1])} is charging ${p[2]}!`, 'sys', BEAT.hit);
			return;
		case '-mustrecharge':
			this.say(room, `${this.label(room, p[1])} must recharge next turn.`, 'sys', BEAT.minor);
			return;

		// ------------------------------------------------------- HP ------
		case '-damage': case '-heal': case '-sethp': {
			const pos = posOf(p[1]);
			const heal = cmd === '-heal';
			this.push(room, {
				hold: BEAT.hit,
				run: r => {
					const mon = this.mon(r, pos);
					const before = mon.maxhp ? mon.hp / mon.maxhp : 1;
					this.setHP(mon, p[2]);
					const after = mon.maxhp ? mon.hp / mon.maxhp : 1;
					const moved = Math.abs(after - before);
					const delta = Math.round(moved * 100);
					const node = this.spriteOf(r, pos);
					this.renderField(r);
					// `[silent]` is the sim saying "do not narrate this one", and
					// a change too small to round to a percent has nothing to
					// report either.
					if (kw.silent !== undefined || (!moved && cmd !== '-sethp')) {
						return BattleFX.wait(60);
					}
					const amount = delta ? `${delta}%` : 'a little';
					if (cmd === '-sethp') {
						this.log(r, `${this.label(r, p[1])}'s HP was set to ${Math.round(after * 100)}%.`, 'sys');
						return BattleFX.wait(120);
					}
					if (heal) {
						this.log(r, `${this.label(r, p[1])} restored ${amount} HP${because()}.`, 'good');
						return BattleFX.heal(r.fx, node);
					}
					this.log(r, `${this.label(r, p[1])} lost ${amount} HP${because()}.`, 'bad');
					if (kw.from) BattleFX.flash(node, '#e2593f', 0.4);
					return BattleFX.wait(120);
				},
			});
			return;
		}
		case '-fieldactivate':
			this.say(room, `${effectName(p[1])} took effect!`, 'sys', BEAT.minor);
			return;

		// ---------------------------------------------------- status -----
		case '-status': {
			const pos = posOf(p[1]);
			this.push(room, {
				text: silent ? '' : `${this.label(room, p[1])} was ${STATUS_NAME[p[2]] || p[2]}${because()}!`,
				cls: 'bad', hold: BEAT.minor,
				run: r => {
					this.mon(r, pos).status = p[2];
					this.renderField(r);
					return BattleFX.status(r.fx, this.spriteOf(r, pos), p[2]);
				},
			});
			return;
		}
		case '-curestatus': {
			const pos = posOf(p[1]);
			this.push(room, {
				text: silent ? '' : `${this.label(room, p[1])} is no longer ${STATUS_NAME[p[2]] || p[2]}${because()}.`,
				cls: 'good', hold: BEAT.minor,
				run: r => {
					this.mon(r, pos).status = '';
					this.renderField(r);
					return BattleFX.heal(r.fx, this.spriteOf(r, pos));
				},
			});
			return;
		}
		case '-cureteam':
			this.say(room, `${this.who(room, posOf(p[1]))}'s team was cured!`, 'good', BEAT.minor);
			return;

		// ---------------------------------------------------- boosts -----
		case '-boost': case '-unboost': {
			const pos = posOf(p[1]);
			const up = cmd === '-boost';
			const amount = Number(p[3]) || 0;
			const stat = STAT_NAME[p[2]] || p[2];
			this.push(room, {
				hold: BEAT.minor,
				run: r => {
					const mon = this.mon(r, pos);
					if (!amount) {
						this.log(r, `${this.label(r, p[1])}'s ${stat} won't go any ` +
						`${up ? 'higher' : 'lower'}!`, 'sys');
						return BattleFX.wait(80);
					}
					mon.boosts[p[2]] = Math.max(-6, Math.min(6,
						(mon.boosts[p[2]] || 0) + (up ? amount : -amount)));
					this.renderField(r);
					const word = (up ? STAGE_WORD : DROP_WORD)[Math.min(3, amount)] ||
						`${up ? 'rose' : 'fell'} by ${amount}`;
					if (silent) return BattleFX.wait(40);
					this.log(r, `${this.label(r, p[1])}'s ${stat} ${word}${because()}!`,
						up ? 'good' : 'bad');
					return BattleFX.boost(r.fx, this.spriteOf(r, pos), up, amount);
				},
			});
			return;
		}
		case '-setboost': {
			const pos = posOf(p[1]);
			this.push(room, {
				text: `${this.label(room, p[1])}'s ${STAT_NAME[p[2]] || p[2]} was set to ` +
					`${Number(p[3]) > 0 ? '+' : ''}${p[3]}${because()}!`,
				cls: Number(p[3]) >= 0 ? 'good' : 'bad', hold: BEAT.minor,
				run: r => {
					this.mon(r, pos).boosts[p[2]] = Number(p[3]) || 0;
					this.renderField(r);
					return BattleFX.boost(r.fx, this.spriteOf(r, pos), Number(p[3]) >= 0, 2);
				},
			});
			return;
		}
		case '-clearboost': case '-clearpositiveboost': case '-clearnegativeboost': {
			const pos = posOf(p[1]);
			const which = cmd === '-clearboost' ? 'stat changes' :
				cmd === '-clearpositiveboost' ? 'raised stats' : 'lowered stats';
			this.push(room, {
				text: `${this.label(room, p[1])}'s ${which} were removed${because()}!`,
				cls: 'sys', hold: BEAT.minor,
				run: r => {
					const mon = this.mon(r, pos);
					for (const stat of Object.keys(mon.boosts)) {
						const value = mon.boosts[stat];
						if (cmd === '-clearboost' ||
							(cmd === '-clearpositiveboost' && value > 0) ||
							(cmd === '-clearnegativeboost' && value < 0)) delete mon.boosts[stat];
					}
					this.renderField(r);
					return BattleFX.wait(80);
				},
			});
			return;
		}
		case '-clearallboost':
			this.push(room, {
				text: `Every stat change on the field was removed!`, cls: 'sys', hold: BEAT.minor,
				run: r => {
					for (const side of ['p1', 'p2']) {
						for (const mon of r.active[side] || []) if (mon) mon.boosts = {};
					}
					this.renderField(r);
					return BattleFX.wait(80);
				},
			});
			return;
		case '-invertboost':
			this.push(room, {
				text: `${this.label(room, p[1])}'s stat changes were inverted!`, cls: 'sys',
				hold: BEAT.minor,
				run: r => {
					const mon = this.mon(r, posOf(p[1]));
					for (const stat of Object.keys(mon.boosts)) mon.boosts[stat] *= -1;
					this.renderField(r);
					return BattleFX.wait(80);
				},
			});
			return;
		case '-swapboost':
			this.say(room, `${this.label(room, p[1])} and ${this.label(room, p[2])} swapped stat changes!`,
				'sys', BEAT.minor);
			return;
		case '-copyboost':
			this.say(room, `${this.label(room, p[1])} copied ${this.label(room, p[2])}'s stat changes!`,
				'sys', BEAT.minor);
			return;

		// ----------------------------------------------------- field -----
		case '-weather': {
			const id = toID(p[1]);
			const gone = p[1] === 'none';
			const upkeep = !!kw.upkeep;
			const look = BattleFXFieldLooks[id];
			if (upkeep) {
				this.say(room, `${look?.label || effectName(p[1])} continues.`, 'sys', BEAT.switchIn);
				return;
			}
			this.push(room, {
				text: gone ? `The weather cleared up.` :
				`${look?.label || effectName(p[1])} kicked up${because()}!`,
				cls: 'sys', hold: BEAT.major,
				run: r => {
					r.field.weather = gone ? '' : p[1];
					this.renderField(r);
					return BattleFX.field(r.fx, r.scene, id, gone);
				},
			});
			return;
		}
		case '-fieldstart': case '-fieldend': {
			const name = effectName(p[1]);
			const id = toID(name);
			const gone = cmd === '-fieldend';
			const terrain = /terrain/i.test(name);
			this.push(room, {
				text: gone ? `${name} wore off.` : `${name} covered the field${because()}!`,
				cls: 'sys', hold: BEAT.major,
				run: r => {
					if (terrain) r.field.terrain = gone ? '' : name;
					else if (gone) delete r.field.pseudo[name];
					else r.field.pseudo[name] = true;
					this.renderField(r);
					return BattleFX.field(r.fx, r.scene, id, gone);
				},
			});
			return;
		}
		case '-sidestart': case '-sideend': {
			const name = effectName(p[2]);
			const side = posOf(p[1]);
			const gone = cmd === '-sideend';
			const whose = side === room.mySide ? 'your side' : 'the opposing side';
			this.push(room, {
				text: gone ? `${name} disappeared from ${whose}.` : `${name} was set up on ${whose}!`,
				cls: 'sys', hold: BEAT.major,
				run: r => {
					const book = r.field.sides[side] || (r.field.sides[side] = {});
					if (gone) delete book[name];
					else book[name] = true;
					this.renderField(r);
					return BattleFX.field(r.fx, r.scene, toID(name), gone);
				},
			});
			return;
		}
		case '-swapsideconditions':
			this.say(room, `The side conditions were swapped!`, 'sys', BEAT.minor);
			return;

		// ------------------------------------------- items and abilities -
		case '-item': {
			const pos = posOf(p[1]);
			const item = p[2];
			this.push(room, {
				text: silent ? '' : `${this.label(room, p[1])}'s ${item} took effect${because()}!`,
				cls: 'sys', hold: silent ? 0 : BEAT.minor,
				run: r => {
					const mon = this.mon(r, pos);
					mon.item = item;
					this.knownOf(r, mon).item = item;
					this.renderField(r);
					if (silent) return BattleFX.wait(40);
					return BattleFX.item(r.fx, this.spriteOf(r, pos), ART.item(item));
				},
			});
			return;
		}
		case '-enditem': {
			const pos = posOf(p[1]);
			const item = p[2];
			this.push(room, {
				text: `${this.label(room, p[1])} used up its ${item}${because()}.`,
				cls: 'sys', hold: BEAT.minor,
				run: r => {
					const mon = this.mon(r, pos);
					this.knownOf(r, mon).item = item;
					mon.item = '';
					this.renderField(r);
					return BattleFX.item(r.fx, this.spriteOf(r, pos), ART.item(item));
				},
			});
			return;
		}
		case '-ability': {
			const pos = posOf(p[1]);
			const ability = p[2];
			this.push(room, {
				text: silent ? '' : `${this.label(room, p[1])}'s ${ability} took effect!`,
				cls: 'ability', hold: silent ? 0 : BEAT.minor,
				run: r => {
					const mon = this.mon(r, pos);
					mon.ability = ability;
					this.knownOf(r, mon).ability = ability;
					this.renderField(r);
					if (silent) return BattleFX.wait(40);
					return BattleFX.ability(r.fx, this.spriteOf(r, pos), ability,
						this.isMine(r, p[1]));
				},
			});
			return;
		}
		case '-endability':
			this.push(room, {
				text: `${this.label(room, p[1])}'s ability was suppressed!`, cls: 'sys',
				hold: BEAT.minor,
				run: r => { this.mon(r, posOf(p[1])).ability = ''; this.renderField(r); },
			});
			return;
		case '-transform':
			this.say(room, `${this.label(room, p[1])} transformed into ${this.label(room, p[2])}!`,
				'sys', BEAT.major);
			return;
		case '-mega': case '-primal': case '-burst': {
			const pos = posOf(p[1]);
			const stone = p[3] && p[3] !== 'Mega Evolution' ? ` using its ${p[3]}` : '';
			this.push(room, {
				text: `${this.label(room, p[1])} Mega Evolved${stone}!`, cls: 'mega',
				hold: BEAT.major,
				run: r => {
					const mon = this.mon(r, pos);
					mon.mega = true;
					this.renderField(r);
					return BattleFX.mega(r.fx, this.spriteOf(r, pos));
				},
			});
			return;
		}
		case '-terastallize':
			this.say(room, `${this.label(room, p[1])} Terastallized into ${p[2]}!`, 'mega', BEAT.major);
			return;

		// -------------------------------------------- volatile effects ---
		case '-start': {
			const pos = posOf(p[1]);
			const name = effectName(p[2]);
			const texts = {
				confusion: `${this.label(room, p[1])} became confused${because()}!`,
				Substitute: `${this.label(room, p[1])} put up a substitute!`,
				'Leech Seed': `${this.label(room, p[1])} was seeded!`,
				Encore: `${this.label(room, p[1])} got an encore!`,
				Taunt: `${this.label(room, p[1])} fell for the taunt!`,
				Disable: `${this.label(room, p[1])}'s ${p[3] || 'move'} was disabled!`,
				Torment: `${this.label(room, p[1])} was tormented!`,
				Attract: `${this.label(room, p[1])} fell in love!`,
				perish3: `${this.label(room, p[1])}'s perish count fell to 3.`,
				perish2: `${this.label(room, p[1])}'s perish count fell to 2.`,
				perish1: `${this.label(room, p[1])}'s perish count fell to 1.`,
				perish0: `${this.label(room, p[1])}'s perish count fell to 0!`,
				typechange: `${this.label(room, p[1])} became ${p[3] || 'a new type'}!`,
				typeadd: `${p[3]} type was added to ${this.label(room, p[1])}!`,
			};
			this.push(room, {
				text: silent ? '' :
				texts[name] || `${this.label(room, p[1])} was caught in ${name}${because()}!`,
				cls: 'sys', hold: silent ? 0 : BEAT.minor,
				run: r => {
					this.mon(r, pos).volatiles[name] = { silent, detail: p[3] || '' };
					this.renderField(r);
					return BattleFX.wait(60);
				},
			});
			return;
		}
		case '-end': {
			const pos = posOf(p[1]);
			const name = effectName(p[2]);
			this.push(room, {
				text: silent ? '' : `${this.label(room, p[1])}'s ${name} ended.`,
				cls: 'sys', hold: silent ? 0 : BEAT.minor,
				run: r => {
					delete this.mon(r, pos).volatiles[name];
					this.renderField(r);
					return BattleFX.wait(60);
				},
			});
			return;
		}
		case '-singlemove': case '-singleturn': {
			const name = effectName(p[2]);
			this.say(room, `${this.label(room, p[1])} used ${name}!`, 'sys', BEAT.minor);
			return;
		}
		case '-activate': {
			const name = effectName(p[2]);
			const special = {
				confusion: `${this.label(room, p[1])} is confused!`,
				Substitute: `${this.label(room, p[1])}'s substitute took the hit!`,
				Protect: `${this.label(room, p[1])} protected itself!`,
				Struggle: `${this.label(room, p[1])} has no moves left!`,
				trapped: `${this.label(room, p[1])} can't escape!`,
				Attract: `${this.label(room, p[1])} is immobilized by love!`,
			};
			this.push(room, {
				text: silent ? '' : special[name] || `${this.label(room, p[1])}'s ${name} activated!`,
				cls: 'sys', hold: silent ? 0 : BEAT.minor,
				run: r => (silent ? null : BattleFX.flash(this.spriteOf(r, posOf(p[1])), '#ffd166', 0.3)),
			});
			return;
		}
		case '-hint':
			this.say(room, `(${p[1]})`, 'hint', BEAT.minor);
			return;
		case '-message': case 'message':
			this.say(room, p.slice(1).join(' '), 'sys', BEAT.minor);
			return;

		// ------------------------------------------------------- end -----
		case 'win':
			this.push(room, {
				text: `${p[1]} won the battle!`, cls: 'win', hold: BEAT.end,
				run: r => {
					r.ended = true;
					r.request = null;
					r.pendingRequest = undefined;
					this.renderControls(r);
					this.showRewards(r, p[1]);
				},
			});
			return;
		case 'tie':
			this.push(room, {
				text: `The battle ended in a tie.`, cls: 'win', hold: BEAT.end,
				run: r => { r.ended = true; r.request = null; this.renderControls(r); },
			});
			return;

		// ---------------------------------------------------- control ----
		case 'request': {
			if (!p[1]) return;
			let parsed;
			try { parsed = JSON.parse(p.slice(1).join('|')); } catch { return; }
			// Held back until the animation queue has drained, so the buttons
			// never appear while the last turn is still being played out.
			room.pendingRequest = parsed;
			if (!room.playing) this.play(room);
			return;
		}
		case 'error':
			this.say(room, p.slice(1).join(' '), 'bad', BEAT.minor);
			this.push(room, { hold: 0, run: r => this.renderControls(r) });
			return;
		default:
			// Nothing is allowed to happen silently: an unhandled line is still
			// reported, so a gap in this switch shows up instead of hiding.
			if (cmd.startsWith('-')) {
				this.say(room, `${cmd.slice(1)}: ${p.slice(1).filter(Boolean).join(' ')}`,
					'hint', BEAT.minor);
			}
		}
	},

	title(room) {
		const p1 = room.sides.p1?.name || 'Player 1';
		const p2 = room.sides.p2?.name || 'Player 2';
		room.node.querySelector('.battle-title').textContent = `${p1} vs ${p2}`;
	},

	// -----------------------------------------------------------------
	// Rendering
	// -----------------------------------------------------------------
	renderField(room) {
		const foe = room.mySide === 'p1' ? 'p2' : 'p1';
		this.renderRow(room, foe, room.node.querySelector('.field-row.foe'), true);
		this.renderRow(room, room.mySide, room.node.querySelector('.field-row.mine'), false);
		this.renderTags(room);
		room.scene.dataset.weather = toID(room.field.weather || '');
		room.scene.dataset.terrain = toID(room.field.terrain || '');
	},

	renderRow(room, side, container, isFoe) {
		container.innerHTML = '';
		const list = room.active[side] || [];
		if (!list.length) {
			container.appendChild(el('div', 'field-slot empty'));
			return;
		}
		list.forEach((mon, slot) => {
			if (!mon) return;
			container.appendChild(this.renderSlot(room, mon, slot, isFoe));
		});
	},

	renderSlot(room, mon, slot, isFoe) {
		const node = el('div', `field-slot${mon.fainted ? ' fainted' : ''}${isFoe ? ' foe' : ' mine'}`);
		node.dataset.pos = `${mon.side}${String.fromCharCode(97 + slot)}`;

		const wrap = el('div', 'sprite-wrap');
		const sprite = img(ART.pokemon(mon.species), mon.species);
		sprite.className = 'sprite';
		wrap.appendChild(sprite);
		node.appendChild(wrap);

		const plate = el('div', 'plate');
		const top = el('div', 'plate-top');
		top.appendChild(el('span', 'plate-name', this.nameOf(mon)));
		if (mon.gender) top.appendChild(el('span', `gender ${mon.gender}`, mon.gender));
		top.appendChild(el('span', 'plate-level', `L${mon.level}`));
		plate.appendChild(top);

		const pct = mon.maxhp ? Math.max(0, Math.round(mon.hp / mon.maxhp * 100)) : 0;
		const bar = el('div', `hpbar${pct <= 20 ? ' low' : pct <= 50 ? ' mid' : ''}`);
		const fill = el('div');
		fill.style.width = `${pct}%`;
		bar.appendChild(fill);
		plate.appendChild(bar);

		const badges = el('div', 'plate-badges');
		badges.appendChild(el('span', 'hp-text',
			mon.maxhp === 100 || isFoe ? `${pct}%` : `${mon.hp}/${mon.maxhp}`));
		if (mon.status) badges.appendChild(el('span', `badge status ${mon.status}`, mon.status.toUpperCase()));
		if (mon.mega) badges.appendChild(el('span', 'badge mega', 'MEGA'));
		for (const [stat, value] of Object.entries(mon.boosts || {})) {
			if (!value) continue;
			badges.appendChild(el('span', `badge boost ${value > 0 ? 'up' : 'down'}`,
				`${STAT_LABEL[stat] || stat} ${value > 0 ? '+' : ''}${value}`));
		}
		for (const [name, info] of Object.entries(mon.volatiles || {})) {
			if (info && info.silent) continue;
			badges.appendChild(el('span', 'badge volatile', name));
		}
		const known = this.knownOf(room, mon);
		if (known.item) {
			const chip = el('span', 'badge item');
			const icon = img(ART.item(known.item), known.item);
			icon.className = 'item-icon';
			chip.append(icon, document.createTextNode(known.item));
			badges.appendChild(chip);
		}
		plate.appendChild(badges);
		node.appendChild(plate);

		Tip.bind(node, () => this.monCard(room, mon, isFoe));

		// Doubles targeting: click a Pokemon to aim at it - a foe, or your own
		// partner. Showdown numbers your own side with negative slots.
		if (room.pendingMove && !mon.fainted && isLegalTarget(room.pendingMove, isFoe, slot)) {
			node.classList.add('targetable');
			node.onclick = () => this.chooseTarget(room, isFoe ? slot + 1 : -(slot + 1));
		}
		return node;
	},

	renderTags(room) {
		const box = room.node.querySelector('.field-tags');
		box.innerHTML = '';
		const add = (text, cls, tip) => {
			const tag = el('span', `field-tag ${cls}`, text);
			if (tip) Tip.bind(tag, () => tip);
			box.appendChild(tag);
		};
		if (room.field.weather) {
			const look = BattleFXFieldLooks[toID(room.field.weather)];
			add(look?.label || room.field.weather, 'weather');
		}
		if (room.field.terrain) add(room.field.terrain, 'terrain');
		for (const name of Object.keys(room.field.pseudo)) add(name, 'pseudo');
		for (const side of ['p1', 'p2']) {
			const mine = side === room.mySide;
			for (const name of Object.keys(room.field.sides[side] || {})) {
				add(`${mine ? '▼' : '▲'} ${name}`, mine ? 'side-mine' : 'side-foe',
					`<b>${escapeHTML(name)}</b><div class="tip-note">On ${mine ? 'your' : 'the opposing'} side.</div>`);
			}
		}
	},

	// -----------------------------------------------------------------
	// Hover cards
	// -----------------------------------------------------------------
	/** Everything the player is allowed to know about one Pokemon. */
	monCard(room, mon, isFoe) {
		const species = D.pokedex[toID(mon.species)];
		const known = this.knownOf(room, mon);
		const mine = !isFoe;
		const rows = [];

		rows.push(`<div class="tip-head"><b>${escapeHTML(this.nameOf(mon))}</b>` +
			` <span class="tip-dim">L${mon.level}${mon.gender ? ` ${mon.gender}` : ''}</span></div>`);
		rows.push(`<div>${typeChips(species?.types)}</div>`);
		const pct = mon.maxhp ? Math.round(mon.hp / mon.maxhp * 100) : 0;
		rows.push(`<div class="tip-row"><span>HP</span><b>${mine && mon.maxhp !== 100 ?
			`${mon.hp}/${mon.maxhp} (${pct}%)` : `${pct}%`}</b></div>`);
		if (mon.status) {
			rows.push(`<div class="tip-row"><span>Status</span><b>${STATUS_NAME[mon.status] || mon.status}</b></div>`);
		}

		// Stats. Yours are exact - they came from your own request. Theirs are a
		// window, from an uninvested hindering spread up to a fully invested
		// boosted one, so nothing is spoiled that you could not work out.
		if (species) {
			const own = mine ? this.myRequestSet(room, mon) : null;
			const lines = STATS.filter(s => s !== 'hp' || !own).map(stat => {
				const base = species.baseStats[stat];
				if (own && own.stats && own.stats[stat] !== undefined) {
					return `<div class="tip-row"><span>${STAT_LABEL[stat]}</span><b>${own.stats[stat]}</b></div>`;
				}
				const [lo, hi] = statSpread(stat, base, mon.level);
				return `<div class="tip-row"><span>${STAT_LABEL[stat]}</span>` +
					`<b>${lo}<span class="tip-dim"> – </span>${hi}</b></div>`;
			});
			rows.push(`<div class="tip-stats">${lines.join('')}</div>`);
			if (!mine) rows.push(`<div class="tip-note">Ranges: min IVs/EVs and a hindering nature, up to max and a boosting one.</div>`);
		}

		// Ability: yours is known; theirs only once it has actually shown itself.
		if (mine) {
			const own = this.myRequestSet(room, mon);
			if (own?.ability || mon.ability) {
				const name = D.abilities[toID(own?.ability || mon.ability)]?.name || own?.ability || mon.ability;
				rows.push(`<div class="tip-row"><span>Ability</span><b>${escapeHTML(name)}</b></div>`);
			}
			if (own?.item) rows.push(`<div class="tip-row"><span>Item</span><b>${escapeHTML(own.item)}</b></div>`);
		} else if (known.ability) {
			rows.push(`<div class="tip-row"><span>Ability</span><b>${escapeHTML(known.ability)}</b>` +
				`<span class="tip-dim"> (seen)</span></div>`);
		} else if (species) {
			const possible = Object.values(species.abilities || {}).filter(Boolean);
			rows.push(`<div class="tip-row"><span>Ability</span><b>${possible.map(escapeHTML).join(' / ')}</b></div>`);
			if (possible.length > 1) rows.push(`<div class="tip-note">One of these - it is only confirmed once it takes effect.</div>`);
		}
		if (!mine && known.item) {
			rows.push(`<div class="tip-row"><span>Item</span><b>${escapeHTML(known.item)}</b>` +
				`<span class="tip-dim"> (seen)</span></div>`);
		}

		// Moves.
		if (mine) {
			const own = this.myRequestSet(room, mon);
			const moves = own?.moves || known.moves;
			if (moves?.length) {
				rows.push(`<div class="tip-sub">Moves</div><div class="tip-moves">` +
					moves.map(m => {
						const data = D.moves[toID(m)];
						return `<span class="tip-move type-${data?.type || 'Normal'}">` +
							`${escapeHTML(data?.name || m)}</span>`;
					}).join('') + `</div>`);
			}
		} else {
			rows.push(`<div class="tip-sub">Moves seen</div>`);
			rows.push(known.moves.length ?
				`<div class="tip-moves">${known.moves.map(m => {
					const data = D.moves[toID(m)];
					return `<span class="tip-move type-${data?.type || 'Normal'}">${escapeHTML(m)}</span>`;
				}).join('')}</div>` :
				`<div class="tip-note">None yet.</div>`);
		}
		const shown = Object.entries(mon.volatiles || {})
			.filter(([, info]) => !(info && info.silent)).map(([name]) => name);
		if (shown.length) {
			rows.push(`<div class="tip-sub">Right now</div><div class="tip-note">` +
				shown.map(escapeHTML).join(', ') + `</div>`);
		}
		return rows.join('');
	},

	/** The request entry for one of your own active Pokemon, if there is one. */
	myRequestSet(room, mon) {
		const list = room.request?.side?.pokemon;
		if (!list) return null;
		return list.find(set => set.active && toID(set.details?.split(',')[0]) === toID(mon.species)) ||
			list.find(set => toID(set.details?.split(',')[0]) === toID(mon.species)) || null;
	},

	/** The card behind a move button. */
	moveCard(move, data) {
		const info = D.moves[toID(move.move || move.id)] || data;
		if (!info) return `<b>${escapeHTML(move.move || move.id)}</b>`;
		const rows = [`<div class="tip-head"><b>${escapeHTML(info.name)}</b></div>`,
			`<div>${typeChips([info.type])}<span class="badge cat">${escapeHTML(info.category)}</span></div>`,
			`<div class="tip-row"><span>Power</span><b>${info.basePower || '—'}</b></div>`,
			`<div class="tip-row"><span>Accuracy</span><b>${info.accuracy === true ? '—' : info.accuracy}</b></div>`];
		if (move.pp !== undefined) {
			rows.push(`<div class="tip-row"><span>PP</span><b>${move.pp}/${move.maxpp}</b></div>`);
		}
		if (info.priority) {
			rows.push(`<div class="tip-row"><span>Priority</span><b>${info.priority > 0 ? '+' : ''}${info.priority}</b></div>`);
		}
		rows.push(`<div class="tip-row"><span>Target</span><b>${escapeHTML(TARGET_WORDS[info.target] || info.target || 'normal')}</b></div>`);
		if (info.desc || info.shortDesc) {
			rows.push(`<div class="tip-note">${escapeHTML(info.shortDesc || info.desc)}</div>`);
		}
		return rows.join('');
	},

	// -----------------------------------------------------------------
	// Controls
	// -----------------------------------------------------------------
	/**
	 * Which active slots the player actually has to decide for.
	 *
	 * The server fills in `pass` by itself for a slot that cannot act - a
	 * fainted partner in doubles, or one that is not being asked to switch - so
	 * sending one anyway is one choice too many and the whole turn is rejected.
	 * The answer is therefore a list of slot numbers, and `room.choices[i]` is
	 * the decision for `slots[i]`.
	 */
	decisionSlots(request) {
		const slots = [];
		if (request.forceSwitch) {
			request.forceSwitch.forEach((needed, i) => { if (needed) slots.push(i); });
			return slots;
		}
		const bench = request.side?.pokemon || [];
		(request.active || []).forEach((active, i) => {
			const set = bench[i];
			if (set && set.condition.endsWith(' fnt')) return;
			if (!active || !active.moves?.length) return;
			slots.push(i);
		});
		return slots;
	},

	renderControls(room) {
		const box = room.node.querySelector('.battle-controls');
		box.innerHTML = '';
		const request = room.request;
		if (room.ended) {
			box.appendChild(el('div', 'hint', 'The battle is over.'));
			return;
		}
		if (!request || request.wait) {
			box.appendChild(el('div', 'hint', 'Waiting for the opponent…'));
			return;
		}
		if (request.teamPreview) {
			const go = el('button', 'primary', 'Start the battle');
			go.onclick = () => {
				Net.sendTo(room.roomid, `/choose default|${request.rqid}`);
				room.request = null;
				this.renderControls(room);
			};
			box.append(el('div', 'hint', 'Team preview'), go);
			return;
		}
		const slots = this.decisionSlots(request);
		if (!slots.length) {
			this.submitIfReady(room);
			return;
		}
		const slot = slots[room.choices.length];
		if (slot === undefined) {
			this.submitIfReady(room);
			return;
		}

		if (request.forceSwitch) {
			// Two slots to fill and only one Pokémon left to fill them with: the
			// slot that cannot be filled has to pass, or the turn is never sent
			// and the battle stops dead.
			if (!(request.side?.pokemon || []).some((set, i) => this.canSend(room, set, i))) {
				room.choices.push('pass');
				if (!this.submitIfReady(room)) this.renderControls(room);
				return;
			}
			box.appendChild(el('div', 'prompt',
				slots.length > 1 ?
					`Send out a Pokémon for slot ${slot + 1}` : `Choose a Pokémon`));
			box.appendChild(this.switchGrid(room, request));
			return;
		}
		if (request.active) {
			const active = request.active[slot];
			if (slots.length > 1) {
				box.appendChild(el('div', 'prompt', `What should slot ${slot + 1} do?`));
			}
			if (room.pendingMove) {
				box.appendChild(el('div', 'prompt',
					`Choose a target for ${room.pendingMove.name} — click a Pokémon above.`));
				const cancel = el('button', null, 'Back');
				cancel.onclick = () => { room.pendingMove = null; this.renderControls(room); };
				box.appendChild(cancel);
				return;
			}

			const moves = el('div', 'move-grid');
			(active.moves || []).forEach((move, i) => {
				const data = D.moves[toID(move.id || move.move)];
				const btn = el('button', `move-btn type-${data?.type || 'Normal'}`);
				btn.appendChild(el('span', 'move-name', move.move || data?.name || move.id));
				btn.appendChild(el('span', 'move-meta',
					`${data?.category || ''} · ${move.pp ?? '—'}/${move.maxpp ?? '—'}`));
				btn.disabled = !!move.disabled;
				Tip.bind(btn, () => this.moveCard(move, data));
				btn.onclick = () => this.pickMove(room, i + 1, move, data);
				moves.appendChild(btn);
			});
			box.appendChild(moves);

			if (active.canMegaEvo) {
				const mega = el('button', `toggle${room.mega ? ' on' : ''}`,
					room.mega ? '★ Mega Evolution ON' : '☆ Mega Evolve');
				mega.onclick = () => { room.mega = !room.mega; this.renderControls(room); };
				box.appendChild(mega);
			}
			if (!active.trapped && !active.maybeTrapped) {
				box.appendChild(el('div', 'prompt', 'or switch to'));
				box.appendChild(this.switchGrid(room, request, false));
			}
		}
	},

	/** Whether this bench entry can still be sent out right now. */
	canSend(room, set, index) {
		return !!set && !set.active && !set.condition.endsWith(' fnt') &&
			!room.choices.includes(`switch ${index + 1}`);
	},

	switchGrid(room, request) {
		const grid = el('div', 'switch-grid');
		(request.side?.pokemon || []).forEach((set, i) => {
			const species = set.details.split(',')[0].trim();
			const dead = set.condition.endsWith(' fnt');
			const btn = el('button', `switch-btn${dead ? ' fainted' : ''}`);
			const icon = img(ART.icon(species), species);
			icon.className = 'switch-icon';
			btn.appendChild(icon);
			btn.appendChild(el('span', null, species));
			const hp = set.condition.split(' ')[0];
			btn.appendChild(el('span', 'switch-hp', dead ? 'fainted' : hp));
			btn.disabled = !this.canSend(room, set, i);
			Tip.bind(btn, () => this.benchCard(set, species));
			btn.onclick = () => this.choose(room, `switch ${i + 1}`);
			grid.appendChild(btn);
		});
		return grid;
	},

	benchCard(set, species) {
		const data = D.pokedex[toID(species)];
		const rows = [`<div class="tip-head"><b>${escapeHTML(species)}</b></div>`,
			`<div>${typeChips(data?.types)}</div>`,
			`<div class="tip-row"><span>HP</span><b>${escapeHTML(set.condition)}</b></div>`];
		if (set.ability) {
			rows.push(`<div class="tip-row"><span>Ability</span><b>` +
				`${escapeHTML(D.abilities[toID(set.ability)]?.name || set.ability)}</b></div>`);
		}
		if (set.item) rows.push(`<div class="tip-row"><span>Item</span><b>${escapeHTML(set.item)}</b></div>`);
		if (set.stats) {
			rows.push(`<div class="tip-stats">` + STATS.filter(s => s !== 'hp').map(stat =>
				`<div class="tip-row"><span>${STAT_LABEL[stat]}</span><b>${set.stats[stat]}</b></div>`
			).join('') + `</div>`);
		}
		if (set.moves?.length) {
			rows.push(`<div class="tip-sub">Moves</div><div class="tip-moves">` +
				set.moves.map(id => {
					const move = D.moves[toID(id)];
					return `<span class="tip-move type-${move?.type || 'Normal'}">` +
						`${escapeHTML(move?.name || id)}</span>`;
				}).join('') + `</div>`);
		}
		return rows.join('');
	},

	pickMove(room, index, move, data) {
		const request = room.request;
		const doubles = (request.active || []).length > 1;
		const needsTarget = doubles && CHOOSABLE_TARGETS.includes(data?.target || move.target);
		if (needsTarget) {
			room.pendingMove = { index, name: move.move || data?.name || move.id, target: data?.target || move.target };
			this.renderField(room);
			this.renderControls(room);
			return;
		}
		this.choose(room, `move ${index}${room.mega ? ' mega' : ''}`);
	},

	chooseTarget(room, slot) {
		const pending = room.pendingMove;
		if (!pending) return;
		room.pendingMove = null;
		this.choose(room, `move ${pending.index} ${slot}${room.mega ? ' mega' : ''}`);
	},

	choose(room, choice) {
		room.choices.push(choice);
		if (!this.submitIfReady(room)) {
			this.renderField(room);
			this.renderControls(room);
		}
	},

	submitIfReady(room) {
		const request = room.request;
		if (!request) return false;
		const needed = this.decisionSlots(request).length;
		if (room.choices.length < needed) return false;
		Net.sendTo(room.roomid, `/choose ${room.choices.join(', ')}|${request.rqid}`);
		room.request = null;
		room.choices = [];
		room.mega = false;
		room.pendingMove = null;
		this.renderField(room);
		// `request` is null now, so this lands on the "waiting" branch and
		// cannot come back here.
		this.renderControls(room);
		return true;
	},

	// -----------------------------------------------------------------
	// The spoils screen
	// -----------------------------------------------------------------
	showRewards(room, winner) {
		if (room.rewardsShown) return;
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
		const last = room.knockouts[room.knockouts.length - 1];
		const money = REWARDS.prizeMoney(last.level);

		const card = el('div', 'rewards');
		card.appendChild(el('h3', null, 'Spoils'));
		card.appendChild(el('p', 'hint',
			'What this battle would have been worth. Nothing is stored — it is the number a trainer would care about.'));
		for (const [species, exp] of earned) {
			if (!exp) continue;
			const row = el('div', 'reward-row');
			const icon = img(ART.icon(species), species);
			icon.className = 'switch-icon';
			row.append(icon, el('span', 'grow', species), el('b', null, `+${exp} EXP`));
			card.appendChild(row);
		}
		card.appendChild(el('div', 'reward-row money',
			`Prize money: ₽${money.toLocaleString('en-US')}`));
		room.node.querySelector('.battle-log-wrap').prepend(card);
	},
};

/** How a move's target reads in a hover card. */
const TARGET_WORDS = {
	normal: 'one adjacent Pokémon', self: 'the user', adjacentAlly: 'an ally',
	adjacentAllyOrSelf: 'the user or an ally', adjacentFoe: 'one adjacent foe',
	allAdjacentFoes: 'all adjacent foes', allAdjacent: 'everything adjacent',
	all: 'the whole field', allySide: 'your side', foeSide: 'the opposing side',
	allyTeam: 'your whole team', any: 'any Pokémon', randomNormal: 'a random foe',
	scripted: 'chosen by the move', allies: 'all allies',
};

window.Battle = Battle;
