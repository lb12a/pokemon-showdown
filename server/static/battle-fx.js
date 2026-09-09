/**
 * Battle effects.
 *
 * Everything visible in a battle that is not a sprite or a piece of text is
 * drawn here, on one canvas stretched over the battle scene. There are no image
 * files involved: every effect is drawn from shapes, so a new one costs a few
 * lines rather than an asset.
 *
 * The centre of it is a small particle system plus two tables:
 *
 *   TYPES       - what each of the 18 types looks like: its colours, the glyph
 *                 its particles are drawn as, and how they move.
 *   CATEGORIES  - how a Physical, Special or Status move is staged.
 *
 * One entry from each table combine into an attack, so the 18 types and 3
 * categories give 54 distinct attack animations, and a type reads the same way
 * whichever move it came from.
 */
'use strict';

// =====================================================================
// Glyphs - the shapes a particle can be drawn as
// =====================================================================
const GLYPHS = {
	dot(ctx, s) {
		ctx.beginPath();
		ctx.arc(0, 0, s, 0, 6.2832);
		ctx.fill();
	},
	spark(ctx, s) {
		ctx.beginPath();
		for (let i = 0; i < 8; i++) {
			const r = i % 2 ? s * 0.35 : s;
			const a = i / 8 * 6.2832;
			ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
		}
		ctx.closePath();
		ctx.fill();
	},
	star(ctx, s) {
		ctx.beginPath();
		for (let i = 0; i < 10; i++) {
			const r = i % 2 ? s * 0.42 : s;
			const a = i / 10 * 6.2832 - 1.5708;
			ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
		}
		ctx.closePath();
		ctx.fill();
	},
	shard(ctx, s) {
		ctx.beginPath();
		ctx.moveTo(0, -s * 1.5);
		ctx.lineTo(s * 0.55, 0);
		ctx.lineTo(0, s * 1.5);
		ctx.lineTo(-s * 0.55, 0);
		ctx.closePath();
		ctx.fill();
	},
	flame(ctx, s) {
		ctx.beginPath();
		ctx.moveTo(0, -s * 1.6);
		ctx.quadraticCurveTo(s, -s * 0.2, s * 0.5, s * 0.8);
		ctx.quadraticCurveTo(0, s * 1.3, -s * 0.5, s * 0.8);
		ctx.quadraticCurveTo(-s, -s * 0.2, 0, -s * 1.6);
		ctx.fill();
	},
	drop(ctx, s) {
		ctx.beginPath();
		ctx.moveTo(0, -s * 1.5);
		ctx.quadraticCurveTo(s * 0.9, s * 0.2, 0, s);
		ctx.quadraticCurveTo(-s * 0.9, s * 0.2, 0, -s * 1.5);
		ctx.fill();
	},
	bolt(ctx, s) {
		ctx.beginPath();
		ctx.moveTo(-s * 0.4, -s * 1.5);
		ctx.lineTo(s * 0.5, -s * 0.2);
		ctx.lineTo(0, -s * 0.1);
		ctx.lineTo(s * 0.6, s * 1.5);
		ctx.lineTo(-s * 0.4, s * 0.1);
		ctx.lineTo(s * 0.05, 0);
		ctx.closePath();
		ctx.fill();
	},
	leaf(ctx, s) {
		ctx.beginPath();
		ctx.moveTo(-s, s);
		ctx.quadraticCurveTo(-s * 0.2, -s * 1.4, s, -s * 0.4);
		ctx.quadraticCurveTo(s * 0.1, s * 0.5, -s, s);
		ctx.fill();
	},
	bubble(ctx, s) {
		ctx.beginPath();
		ctx.arc(0, 0, s, 0, 6.2832);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(-s * 0.35, -s * 0.35, s * 0.22, 0, 6.2832);
		ctx.fill();
	},
	rock(ctx, s) {
		ctx.beginPath();
		ctx.moveTo(-s, -s * 0.3);
		ctx.lineTo(-s * 0.3, -s);
		ctx.lineTo(s * 0.8, -s * 0.5);
		ctx.lineTo(s, s * 0.5);
		ctx.lineTo(s * 0.1, s);
		ctx.lineTo(-s * 0.8, s * 0.6);
		ctx.closePath();
		ctx.fill();
	},
	feather(ctx, s) {
		ctx.beginPath();
		ctx.moveTo(0, -s * 1.6);
		ctx.quadraticCurveTo(s * 0.8, 0, 0, s * 1.4);
		ctx.quadraticCurveTo(-s * 0.8, 0, 0, -s * 1.6);
		ctx.fill();
	},
	ring(ctx, s) {
		ctx.lineWidth = Math.max(1, s * 0.35);
		ctx.beginPath();
		ctx.arc(0, 0, s, 0, 6.2832);
		ctx.stroke();
	},
	wisp(ctx, s) {
		ctx.beginPath();
		ctx.arc(0, 0, s, Math.PI, 0);
		ctx.quadraticCurveTo(s * 0.6, s * 1.2, 0, s * 1.5);
		ctx.quadraticCurveTo(-s * 0.6, s * 1.2, -s, 0);
		ctx.fill();
	},
	hex(ctx, s) {
		ctx.beginPath();
		for (let i = 0; i < 6; i++) {
			const a = i / 6 * 6.2832;
			ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * s, Math.sin(a) * s);
		}
		ctx.closePath();
		ctx.fill();
	},
	claw(ctx, s) {
		ctx.lineWidth = Math.max(1, s * 0.4);
		for (let i = -1; i <= 1; i++) {
			ctx.beginPath();
			ctx.arc(i * s * 0.7, 0, s * 1.2, -1.0, 0.6);
			ctx.stroke();
		}
	},
	heart(ctx, s) {
		ctx.beginPath();
		ctx.moveTo(0, s * 0.9);
		ctx.bezierCurveTo(-s * 1.6, -s * 0.3, -s * 0.5, -s * 1.3, 0, -s * 0.4);
		ctx.bezierCurveTo(s * 0.5, -s * 1.3, s * 1.6, -s * 0.3, 0, s * 0.9);
		ctx.fill();
	},
	gear(ctx, s) {
		ctx.beginPath();
		for (let i = 0; i < 16; i++) {
			const r = i % 2 ? s * 0.72 : s;
			const a = i / 16 * 6.2832;
			ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
		}
		ctx.closePath();
		ctx.fill();
		ctx.globalCompositeOperation = 'destination-out';
		ctx.beginPath();
		ctx.arc(0, 0, s * 0.3, 0, 6.2832);
		ctx.fill();
		ctx.globalCompositeOperation = 'source-over';
	},
	dust(ctx, s) {
		ctx.beginPath();
		ctx.ellipse(0, 0, s * 1.4, s * 0.7, 0, 0, 6.2832);
		ctx.fill();
	},
	slash(ctx, s) {
		ctx.lineWidth = Math.max(1, s * 0.5);
		ctx.beginPath();
		ctx.moveTo(-s * 1.4, s * 0.8);
		ctx.quadraticCurveTo(0, -s * 0.6, s * 1.4, -s * 0.9);
		ctx.stroke();
	},
};

// =====================================================================
// The 18 types
// =====================================================================
/**
 * `glyph`  which shape the particles are drawn as
 * `colors` two or three tones, picked at random per particle
 * `gravity` positive falls, negative rises, 0 floats
 * `spin`   how fast a particle turns
 * `trail`  a projectile leaves a fading tail
 * `beam`   a special move draws a solid beam instead of a stream
 */
const TYPES = {
	Normal: { glyph: 'star', colors: ['#f2efe6', '#d9d2c2', '#fff'], gravity: 0.02, spin: 3 },
	Fire: { glyph: 'flame', colors: ['#ff8a2b', '#ffd166', '#ff3b1f'], gravity: -0.16, spin: 1, trail: true },
	Water: { glyph: 'drop', colors: ['#4fa8ff', '#8fd4ff', '#1c6fd0'], gravity: 0.12, spin: 2 },
	Electric: { glyph: 'bolt', colors: ['#ffe14d', '#fff9c4', '#ffb300'], gravity: 0, spin: 8, beam: true },
	Grass: { glyph: 'leaf', colors: ['#5fce4f', '#a8e86a', '#2e8b32'], gravity: 0.03, spin: 5 },
	Ice: { glyph: 'shard', colors: ['#9fe8f5', '#e4fbff', '#4fb3d0'], gravity: 0.06, spin: 3 },
	Fighting: { glyph: 'spark', colors: ['#e2593f', '#ff9f7a', '#a12f21'], gravity: 0.04, spin: 4 },
	Poison: { glyph: 'bubble', colors: ['#c05fd0', '#e9a8f2', '#7a2c8c'], gravity: -0.09, spin: 1, stroke: true },
	Ground: { glyph: 'dust', colors: ['#c99a4e', '#e8cf9a', '#8a6329'], gravity: 0.22, spin: 2 },
	Flying: { glyph: 'feather', colors: ['#a9c8f0', '#e6f0ff', '#6f95c9'], gravity: -0.03, spin: 3 },
	Psychic: { glyph: 'ring', colors: ['#ff6fb1', '#ffc2de', '#c02f7d'], gravity: 0, spin: 1, stroke: true },
	Bug: { glyph: 'hex', colors: ['#a8c231', '#d6ec78', '#6f8418'], gravity: 0.05, spin: 6 },
	Rock: { glyph: 'rock', colors: ['#b8975a', '#e0c690', '#7b6031'], gravity: 0.3, spin: 4 },
	Ghost: { glyph: 'wisp', colors: ['#8b6fd6', '#c9b4ff', '#4b3287'], gravity: -0.07, spin: 1 },
	Dragon: { glyph: 'slash', colors: ['#7a5cf0', '#b9a6ff', '#3f2aa8'], gravity: 0, spin: 2, stroke: true, beam: true },
	Dark: { glyph: 'claw', colors: ['#5a4a6a', '#9b86b5', '#241a33'], gravity: 0.02, spin: 1, stroke: true },
	Steel: { glyph: 'gear', colors: ['#c3ccd6', '#eef3f8', '#7d8894'], gravity: 0.14, spin: 7 },
	Fairy: { glyph: 'heart', colors: ['#ff9fd4', '#ffe1f2', '#e05fa8'], gravity: -0.05, spin: 3 },
};
const FALLBACK_TYPE = TYPES.Normal;

// How each category is staged. Every field is a knob the type can override.
const CATEGORIES = {
	Physical: { lunge: 1, travel: 0, burst: 34, spread: 3.4, speed: 3.2, shake: 9, ringCount: 2 },
	Special: { lunge: 0.25, travel: 1, burst: 26, spread: 2.2, speed: 2.4, shake: 5, ringCount: 1 },
	Status: { lunge: 0, travel: 0, burst: 20, spread: 1.2, speed: 1.1, shake: 0, ringCount: 3, aura: true },
};

const RNG = () => Math.random();
const rand = (a, b) => a + (b - a) * Math.random();

// =====================================================================
// The particle canvas
// =====================================================================
class FieldFX {
	constructor(host) {
		this.host = host;
		this.canvas = document.createElement('canvas');
		this.canvas.className = 'fx-canvas';
		host.appendChild(this.canvas);
		this.ctx = this.canvas.getContext('2d');
		this.parts = [];
		this.running = false;
		this.resize();
		this._onResize = () => this.resize();
		window.addEventListener('resize', this._onResize);
	}

	destroy() {
		window.removeEventListener('resize', this._onResize);
		this.canvas.remove();
		this.parts.length = 0;
	}

	resize() {
		const rect = this.host.getBoundingClientRect();
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		this.w = Math.max(1, rect.width);
		this.h = Math.max(1, rect.height);
		this.canvas.width = Math.round(this.w * dpr);
		this.canvas.height = Math.round(this.h * dpr);
		this.canvas.style.width = `${this.w}px`;
		this.canvas.style.height = `${this.h}px`;
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	/** Where a slot's sprite sits, in canvas coordinates. */
	pointOf(node) {
		const host = this.host.getBoundingClientRect();
		if (!node) return { x: this.w / 2, y: this.h / 2 };
		const r = node.getBoundingClientRect();
		return { x: r.left - host.left + r.width / 2, y: r.top - host.top + r.height / 2 };
	}

	emit(p) {
		this.parts.push({
			x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0,
			life: p.life || 40, age: 0, size: p.size || 5,
			color: p.color || '#fff', glyph: p.glyph || 'dot',
			gravity: p.gravity || 0, spin: p.spin || 0, angle: p.angle || 0,
			stroke: !!p.stroke, grow: p.grow || 0, fade: p.fade !== false,
		});
		this.start();
	}

	start() {
		if (this.running) return;
		this.running = true;
		const step = () => {
			this.tick();
			if (this.parts.length) {
				requestAnimationFrame(step);
			} else {
				this.running = false;
				this.ctx.clearRect(0, 0, this.w, this.h);
			}
		};
		requestAnimationFrame(step);
	}

	tick() {
		const ctx = this.ctx;
		ctx.clearRect(0, 0, this.w, this.h);
		for (let i = this.parts.length - 1; i >= 0; i--) {
			const p = this.parts[i];
			p.age++;
			if (p.age > p.life) { this.parts.splice(i, 1); continue; }
			p.x += p.vx;
			p.y += p.vy;
			p.vy += p.gravity;
			p.angle += p.spin * 0.03;
			p.size += p.grow;
			const t = p.age / p.life;
			ctx.save();
			ctx.globalAlpha = p.fade ? Math.max(0, 1 - t * t) : 1;
			ctx.translate(p.x, p.y);
			ctx.rotate(p.angle);
			ctx.fillStyle = p.color;
			ctx.strokeStyle = p.color;
			(GLYPHS[p.glyph] || GLYPHS.dot)(ctx, Math.max(0.5, p.size));
			ctx.restore();
		}
	}

	burst(x, y, type, count, spread, speed, sizeScale = 1) {
		const t = TYPES[type] || FALLBACK_TYPE;
		for (let i = 0; i < count; i++) {
			const a = RNG() * 6.2832;
			const v = rand(0.35, 1) * speed;
			this.emit({
				x: x + rand(-6, 6), y: y + rand(-6, 6),
				vx: Math.cos(a) * v * spread, vy: Math.sin(a) * v * spread,
				life: rand(24, 46), size: rand(4, 9) * sizeScale,
				color: t.colors[(Math.random() * t.colors.length) | 0],
				glyph: t.glyph, gravity: t.gravity, spin: rand(-t.spin, t.spin),
				angle: RNG() * 6.2832, stroke: t.stroke,
			});
		}
	}

	/** An expanding ring, used for impacts, auras and field changes. */
	shockring(x, y, color, size = 16, grow = 2.2, life = 26) {
		this.emit({
			x, y, life, size, grow, color, glyph: 'ring', stroke: true, spin: 0,
		});
	}
}

// =====================================================================
// Staged animations
// =====================================================================
const BattleFX = {
	/** Create the effect layer for one battle scene. */
	mount(sceneNode) {
		return new FieldFX(sceneNode);
	},

	/** The colour a type is written in, for text and bars. */
	color(type) {
		return (TYPES[type] || FALLBACK_TYPE).colors[0];
	},

	/**
	 * One attack. `from` and `to` are the sprite elements; the returned promise
	 * settles when the animation is done, so the battle can be paced by it.
	 */
	attack(fx, from, to, type, category, opts = {}) {
		const t = TYPES[type] || FALLBACK_TYPE;
		const c = CATEGORIES[category] || CATEGORIES.Physical;
		const a = fx.pointOf(from);
		const b = fx.pointOf(to);
		const dx = b.x - a.x, dy = b.y - a.y;
		const dist = Math.hypot(dx, dy) || 1;
		const ux = dx / dist, uy = dy / dist;
		const steps = [];

		// 1. The attacker moves. Physical throws its whole body at the target,
		//    special braces and glows, status stays put.
		if (from && c.lunge) {
			const push = 34 * c.lunge;
			steps.push(() => {
				from.style.transition = 'transform .18s cubic-bezier(.2,.9,.3,1.3)';
				from.style.transform = `translate(${ux * push}px, ${uy * push}px) scale(1.06)`;
				setTimeout(() => {
					from.style.transition = 'transform .3s ease-out';
					from.style.transform = '';
				}, 210);
			});
		}
		if (from && category === 'Special') {
			steps.push(() => {
				fx.burst(a.x, a.y, type, 10, 0.7, 1.2, 0.7);
				fx.shockring(a.x, a.y, t.colors[1], 10, 1.4, 18);
			});
		}
		if (from && category === 'Status') {
			steps.push(() => {
				for (let i = 0; i < 3; i++) {
					setTimeout(() => fx.shockring(a.x, a.y, t.colors[0], 12 + i * 6, 1.1, 22), i * 90);
				}
			});
		}

		// 2. Something crosses the gap.
		const travelMs = c.travel ? Math.min(620, 260 + dist * 0.9) : 0;
		if (c.travel) {
			steps.push(() => {
				const frames = Math.round(travelMs / 16);
				for (let i = 0; i < frames; i++) {
					setTimeout(() => {
						const p = i / frames;
						const x = a.x + dx * p;
						const y = a.y + dy * p - Math.sin(p * Math.PI) * (t.beam ? 0 : 26);
						if (t.beam) {
							// A beam is a dense, straight line of particles.
							fx.emit({
								x, y, life: 16, size: rand(5, 9),
								color: t.colors[(Math.random() * t.colors.length) | 0],
								glyph: t.glyph, angle: Math.atan2(dy, dx),
								spin: 0, stroke: t.stroke,
							});
						} else {
							fx.emit({
								x: x + rand(-4, 4), y: y + rand(-4, 4),
								vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4),
								life: t.trail ? 26 : 16, size: rand(5, 10),
								color: t.colors[(Math.random() * t.colors.length) | 0],
								glyph: t.glyph, gravity: t.gravity * 0.4,
								spin: rand(-t.spin, t.spin), angle: RNG() * 6.2832,
								stroke: t.stroke,
							});
						}
					}, i * 16);
				}
			});
		}

		// 3. It lands.
		const impactAt = travelMs + (c.lunge ? 170 : 0);
		steps.push(() => setTimeout(() => {
			fx.burst(b.x, b.y, type, c.burst, c.spread, c.speed);
			for (let i = 0; i < c.ringCount; i++) {
				setTimeout(() => fx.shockring(b.x, b.y, t.colors[i % t.colors.length],
					14 + i * 8, c.aura ? 1.3 : 2.6, c.aura ? 30 : 22), i * 110);
			}
			if (to && c.shake) this.shake(to, c.shake);
			if (to && !opts.silentHit) this.flash(to, t.colors[0], c.aura ? 0.25 : 0.55);
		}, impactAt));

		for (const run of steps) run();
		return this.wait(impactAt + (c.aura ? 620 : 480));
	},

	/** A short shudder, for taking a hit. */
	shake(node, strength) {
		if (!node) return;
		node.animate([
			{ transform: 'translate(0,0)' },
			{ transform: `translate(${strength}px, ${-strength * 0.4}px)` },
			{ transform: `translate(${-strength * 0.8}px, ${strength * 0.5}px)` },
			{ transform: `translate(${strength * 0.5}px, 0)` },
			{ transform: 'translate(0,0)' },
		], { duration: 320, easing: 'ease-out' });
	},

	/** Tint a sprite for a moment. */
	flash(node, color, alpha = 0.5) {
		if (!node) return;
		const glow = document.createElement('div');
		glow.className = 'fx-flash';
		glow.style.background = color;
		glow.style.opacity = String(alpha);
		node.appendChild(glow);
		glow.animate([{ opacity: alpha }, { opacity: 0 }], { duration: 380, easing: 'ease-out' })
			.finished.then(() => glow.remove(), () => glow.remove());
	},

	/** A Pokemon arriving on the field. */
	sendOut(fx, node) {
		if (!node) return this.wait(300);
		const p = fx.pointOf(node);
		for (let i = 0; i < 22; i++) {
			const a = RNG() * 6.2832;
			fx.emit({
				x: p.x, y: p.y, vx: Math.cos(a) * rand(1, 4), vy: Math.sin(a) * rand(1, 4),
				life: 30, size: rand(3, 7), color: ['#ffffff', '#cfe6ff', '#9fd0ff'][(RNG() * 3) | 0],
				glyph: 'spark', spin: 4, angle: a,
			});
		}
		fx.shockring(p.x, p.y, '#dff0ff', 10, 2.4, 24);
		node.animate([
			{ transform: 'translateY(26px) scale(.4)', opacity: 0 },
			{ transform: 'translateY(-6px) scale(1.08)', opacity: 1, offset: 0.65 },
			{ transform: 'translateY(0) scale(1)', opacity: 1 },
		], { duration: 620, easing: 'cubic-bezier(.2,.9,.25,1.2)' });
		return this.wait(660);
	},

	/** A Pokemon leaving, either recalled or knocked out. */
	faint(fx, node) {
		if (!node) return this.wait(300);
		const p = fx.pointOf(node);
		for (let i = 0; i < 16; i++) {
			fx.emit({
				x: p.x + rand(-18, 18), y: p.y + rand(-10, 10),
				vx: rand(-0.6, 0.6), vy: rand(1.2, 3),
				life: 34, size: rand(3, 6), color: '#8b8b96', glyph: 'dot', gravity: 0.06,
			});
		}
		node.animate([
			{ transform: 'translateY(0) scale(1)', opacity: 1, filter: 'grayscale(0)' },
			{ transform: 'translateY(46px) scale(.86)', opacity: 0, filter: 'grayscale(1)' },
		], { duration: 620, easing: 'ease-in', fill: 'forwards' });
		return this.wait(680);
	},

	/** Mega Evolution: the sprite is engulfed, then bursts back out changed. */
	mega(fx, node) {
		if (!node) return this.wait(600);
		const p = fx.pointOf(node);
		const gold = ['#ffd166', '#fff3c4', '#ff9f1c', '#c77dff'];
		for (let ring = 0; ring < 5; ring++) {
			setTimeout(() => fx.shockring(p.x, p.y, gold[ring % gold.length], 8 + ring * 4, 2.8, 26), ring * 120);
		}
		// A helix of sparks spiralling in, then a flare outward.
		for (let i = 0; i < 60; i++) {
			setTimeout(() => {
				const a = i * 0.42;
				const r = 90 - i * 1.2;
				fx.emit({
					x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7,
					vx: -Math.cos(a) * 1.6, vy: -Math.sin(a) * 1.1,
					life: 30, size: rand(4, 8), color: gold[(RNG() * gold.length) | 0],
					glyph: 'star', spin: 5, angle: a,
				});
			}, i * 12);
		}
		setTimeout(() => {
			fx.burst(p.x, p.y, 'Fairy', 40, 3.4, 4);
			fx.shockring(p.x, p.y, '#fff', 12, 4, 24);
		}, 820);
		node.animate([
			{ filter: 'brightness(1)', transform: 'scale(1)' },
			{ filter: 'brightness(2.6)', transform: 'scale(1.12)', offset: 0.6 },
			{ filter: 'brightness(1)', transform: 'scale(1)' },
		], { duration: 1200, easing: 'ease-in-out' });
		return this.wait(1250);
	},

	/** Stat changes: arrows streaming up or down around the sprite. */
	boost(fx, node, up, size = 1) {
		if (!node) return this.wait(240);
		const p = fx.pointOf(node);
		const color = up ? '#4fd18b' : '#e2593f';
		const count = 10 + Math.min(3, size) * 6;
		for (let i = 0; i < count; i++) {
			setTimeout(() => fx.emit({
				x: p.x + rand(-34, 34), y: p.y + (up ? 34 : -34),
				vx: rand(-0.3, 0.3), vy: up ? rand(-2.6, -1.4) : rand(1.4, 2.6),
				life: 32, size: rand(4, 8), color, glyph: 'shard',
				angle: up ? 0 : Math.PI, spin: 0,
			}), i * 26);
		}
		return this.wait(560);
	},

	/** A status condition settling on a Pokemon. */
	status(fx, node, status) {
		const tint = {
			brn: ['#ff7a3d', 'Fire'], psn: ['#c05fd0', 'Poison'], tox: ['#a63fb8', 'Poison'],
			par: ['#ffe14d', 'Electric'], slp: ['#8ea6c9', 'Psychic'], frz: ['#9fe8f5', 'Ice'],
		}[status] || ['#c9c9d4', 'Normal'];
		if (!node) return this.wait(240);
		const p = fx.pointOf(node);
		fx.burst(p.x, p.y, tint[1], 18, 1.4, 1.4);
		fx.shockring(p.x, p.y, tint[0], 18, 1.4, 26);
		this.flash(node, tint[0], 0.4);
		return this.wait(520);
	},

	/** Healing: soft motes drifting upward. */
	heal(fx, node) {
		if (!node) return this.wait(240);
		const p = fx.pointOf(node);
		for (let i = 0; i < 16; i++) {
			setTimeout(() => fx.emit({
				x: p.x + rand(-30, 30), y: p.y + rand(0, 30),
				vx: rand(-0.2, 0.2), vy: rand(-1.6, -0.8),
				life: 36, size: rand(3, 7), color: ['#7bf7b0', '#d6ffe8'][(RNG() * 2) | 0],
				glyph: 'spark', spin: 2,
			}), i * 30);
		}
		this.flash(node, '#7bf7b0', 0.3);
		return this.wait(560);
	},

	/** An item going off: its icon pops above the holder. */
	item(fx, node, iconUrl) {
		if (!node) return this.wait(240);
		const pop = document.createElement('img');
		pop.className = 'fx-item';
		pop.src = iconUrl;
		pop.onerror = () => pop.remove();
		node.appendChild(pop);
		pop.animate([
			{ transform: 'translate(-50%,0) scale(.4)', opacity: 0 },
			{ transform: 'translate(-50%,-26px) scale(1.15)', opacity: 1, offset: 0.4 },
			{ transform: 'translate(-50%,-40px) scale(1)', opacity: 0 },
		], { duration: 900, easing: 'ease-out' }).finished
			.then(() => pop.remove(), () => pop.remove());
		return this.wait(700);
	},

	/** An ability triggering: a nameplate flares at the side of the sprite. */
	ability(fx, node, text, mine) {
		if (!node) return this.wait(240);
		const plate = document.createElement('div');
		plate.className = `fx-ability ${mine ? 'mine' : 'foe'}`;
		plate.textContent = text;
		node.appendChild(plate);
		plate.animate([
			{ opacity: 0, transform: 'translateX(0) scale(.9)' },
			{ opacity: 1, transform: 'translateX(0) scale(1)', offset: 0.2 },
			{ opacity: 1, transform: 'translateX(0) scale(1)', offset: 0.75 },
			{ opacity: 0, transform: 'translateX(0) scale(1)' },
		], { duration: 1100, easing: 'ease-out' }).finished
			.then(() => plate.remove(), () => plate.remove());
		this.flash(node, '#ffd166', 0.3);
		return this.wait(700);
	},

	/**
	 * Weather, terrain, rooms and hazards. The whole scene reacts, because that
	 * is what those effects do - they change the field, not one Pokemon.
	 */
	field(fx, scene, kind, gone) {
		const look = FIELD_LOOKS[kind] || FIELD_LOOKS.default;
		if (gone) return this.wait(340);
		const banner = document.createElement('div');
		banner.className = 'fx-field-banner';
		banner.style.background = look.banner;
		banner.textContent = look.label || kind;
		scene.appendChild(banner);
		banner.animate([
			{ opacity: 0, transform: 'translate(-50%,-14px)' },
			{ opacity: 1, transform: 'translate(-50%,0)', offset: 0.25 },
			{ opacity: 1, transform: 'translate(-50%,0)', offset: 0.7 },
			{ opacity: 0, transform: 'translate(-50%,-10px)' },
		], { duration: 1400, easing: 'ease-out' }).finished
			.then(() => banner.remove(), () => banner.remove());

		for (let i = 0; i < 40; i++) {
			setTimeout(() => fx.emit({
				x: rand(0, fx.w), y: look.rise ? fx.h + 10 : -10,
				vx: rand(-0.6, 0.6) + (look.drift || 0),
				vy: look.rise ? rand(-2.4, -1.2) : rand(1.2, 3),
				life: 60, size: rand(3, 8),
				color: look.colors[(RNG() * look.colors.length) | 0],
				glyph: look.glyph, spin: look.spin || 1, angle: RNG() * 6.2832,
			}), i * 18);
		}
		return this.wait(900);
	},

	wait(ms) {
		return new Promise(resolve => { setTimeout(resolve, ms); });
	},
};

/** How each weather, terrain and room paints the field. */
const FIELD_LOOKS = {
	default: { colors: ['#cfd6e4', '#eef2f8'], glyph: 'spark', banner: 'rgba(90,100,130,.9)' },
	sunnyday: { label: 'Harsh sunlight', colors: ['#ffd166', '#fff0b8'], glyph: 'star', banner: 'rgba(214,140,20,.92)', rise: true },
	raindance: { label: 'Rain', colors: ['#6fb7ff', '#bfe2ff'], glyph: 'drop', banner: 'rgba(40,90,170,.92)', drift: -0.5 },
	sandstorm: { label: 'Sandstorm', colors: ['#d8b775', '#f0dcae'], glyph: 'dust', banner: 'rgba(150,110,45,.92)', drift: 1.4 },
	hail: { label: 'Hail', colors: ['#c9f0ff', '#ffffff'], glyph: 'shard', banner: 'rgba(60,140,180,.92)' },
	snowscape: { label: 'Snow', colors: ['#e8f7ff', '#ffffff'], glyph: 'spark', banner: 'rgba(80,150,190,.92)' },
	snow: { label: 'Snow', colors: ['#e8f7ff', '#ffffff'], glyph: 'spark', banner: 'rgba(80,150,190,.92)' },
	deltastream: { label: 'Strong winds', colors: ['#bcd6f5', '#eaf3ff'], glyph: 'feather', banner: 'rgba(70,110,160,.92)', drift: 2 },
	electricterrain: { label: 'Electric Terrain', colors: ['#ffe14d', '#fff9c4'], glyph: 'bolt', banner: 'rgba(190,150,10,.92)', rise: true },
	grassyterrain: { label: 'Grassy Terrain', colors: ['#7ede63', '#c8f2a8'], glyph: 'leaf', banner: 'rgba(50,140,60,.92)', rise: true },
	mistyterrain: { label: 'Misty Terrain', colors: ['#ffb8e0', '#ffe6f5'], glyph: 'heart', banner: 'rgba(190,80,150,.92)', rise: true },
	psychicterrain: { label: 'Psychic Terrain', colors: ['#ff6fb1', '#ffc2de'], glyph: 'ring', banner: 'rgba(180,40,110,.92)', rise: true },
	trickroom: { label: 'Trick Room', colors: ['#c9a2ff', '#efe0ff'], glyph: 'hex', banner: 'rgba(110,50,180,.92)', rise: true },
	magicroom: { label: 'Magic Room', colors: ['#ffd0f0', '#ffeafa'], glyph: 'ring', banner: 'rgba(170,60,150,.92)', rise: true },
	wonderroom: { label: 'Wonder Room', colors: ['#a2d8ff', '#e0f2ff'], glyph: 'hex', banner: 'rgba(40,120,190,.92)', rise: true },
	hauntedroom: { label: 'Haunted Room', colors: ['#a48bd8', '#d9c9ff'], glyph: 'wisp', banner: 'rgba(70,40,120,.94)', rise: true },
	stealthrock: { label: 'Stealth Rock', colors: ['#b8975a', '#e0c690'], glyph: 'rock', banner: 'rgba(120,90,45,.92)' },
	spikes: { label: 'Spikes', colors: ['#c9c9d4', '#eceef5'], glyph: 'shard', banner: 'rgba(90,95,115,.92)' },
	toxicspikes: { label: 'Toxic Spikes', colors: ['#c05fd0', '#e9a8f2'], glyph: 'shard', banner: 'rgba(110,40,130,.92)' },
	stickyweb: { label: 'Sticky Web', colors: ['#a8c231', '#d6ec78'], glyph: 'hex', banner: 'rgba(110,130,25,.92)' },
	reflect: { label: 'Reflect', colors: ['#8fd4ff', '#dff0ff'], glyph: 'ring', banner: 'rgba(40,110,180,.92)', rise: true },
	lightscreen: { label: 'Light Screen', colors: ['#ffe14d', '#fff9c4'], glyph: 'ring', banner: 'rgba(180,150,30,.92)', rise: true },
	auroraveil: { label: 'Aurora Veil', colors: ['#9fe8f5', '#ffd6f5'], glyph: 'ring', banner: 'rgba(70,150,180,.92)', rise: true },
	tailwind: { label: 'Tailwind', colors: ['#bcd6f5', '#eaf3ff'], glyph: 'feather', banner: 'rgba(60,110,170,.92)', drift: 2.4 },
};

window.BattleFX = BattleFX;
window.BattleFXTypes = TYPES;
window.BattleFXFieldLooks = FIELD_LOOKS;
