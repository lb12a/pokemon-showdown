/**
 * Fakemon chat plugin.
 *
 * Commands for the custom Fakemon system:
 *   /fakemonbot        - start a battle against a named bot
 *   /fakemonchallenge  - invite a friend to a Fakemon battle
 *   /fakemondex        - look up a Fakemon, move, ability or item
 *   /fakemonreport     - the data / balance check report
 *
 * Player-vs-player uses Showdown's own challenge system; `/fakemonchallenge` is
 * just a shortcut that picks the right format, and the private battle link the
 * room produces is what a friend joins.
 */

import { FakemonBot, type BotDifficulty } from '../../data/mods/fakemon/bot';
import { FakemonIndex } from '../../data/mods/fakemon/generated/index';
import { Utils } from '../../lib';

const FAKEMON_FORMATS: { [key: string]: string } = {
	singles: 'fakemonsingles',
	doubles: 'fakemondoubles',
	random: 'fakemonrandombattle',
	randomdoubles: 'fakemonrandomdoublesbattle',
};

const DIFFICULTIES: BotDifficulty[] = ['easy', 'normal', 'hard'];

/**
 * Teams a player has built *for the bot*, in packed form. A packed team is full
 * of commas, so it cannot ride along in `/fakemonbot`'s argument list: the
 * client sends `/fakemonbotteam` first and the battle command picks it up here.
 * One entry per player, replaced by the next upload and dropped on logout.
 */
const botTeams = new Map<ID, { team: string, megaSpecies: string[] }>();

/**
 * `megas=<ids>;<packed team>`. The packed format uses `|` and `]` and never a
 * semicolon, so this prefix cannot collide with a real team.
 */
function parseBotTeam(input: string) {
	const match = /^megas=([^;]*);([\s\S]*)$/.exec(input);
	if (!match) return { team: input, megaSpecies: [] as string[] };
	return {
		team: match[2],
		megaSpecies: match[1].split(',').map(toID).filter(Boolean),
	};
}

/** Descriptions live on the raw data entries, not on the runtime classes. */
function describe(entry: AnyObject | undefined): string {
	return entry?.shortDesc || entry?.desc || '';
}

function resolveFormat(input: string): Format | null {
	const key = toID(input) || 'singles';
	const formatid = FAKEMON_FORMATS[key] || key;
	const format = Dex.formats.get(formatid);
	if (!format.exists || format.mod !== 'fakemon') return null;
	return format;
}

/** A random legal Fakemon team for the given format. */
function randomFakemonTeam(format: Format): string {
	const randomFormat = format.gameType === 'doubles' ?
		Dex.formats.get('fakemonrandomdoublesbattle') : Dex.formats.get('fakemonrandombattle');
	return Teams.pack(Teams.generate(randomFormat));
}

export const commands: Chat.ChatCommands = {
	fakemonbot(target, room, user) {
		this.checkChat();
		const [rawFormat, rawName, rawTeamMode, rawDifficulty] = target.split(',').map(part => part.trim());

		const format = resolveFormat(rawFormat || 'singles');
		if (!format) {
			return this.errorReply(
				`Unknown Fakemon format "${rawFormat}". Use one of: ${Object.keys(FAKEMON_FORMATS).join(', ')}.`
			);
		}

		// The player names their opponent (spec 20); the name shows in the battle UI.
		const botName = (rawName || 'Fakemon Bot').slice(0, 18).replace(/[|,\n]/g, '');
		if (!botName.trim()) return this.errorReply(`Please give the bot a name.`);

		const difficulty = (toID(rawDifficulty) || 'normal') as BotDifficulty;
		if (!DIFFICULTIES.includes(difficulty)) {
			return this.errorReply(`Difficulty must be one of: ${DIFFICULTIES.join(', ')}.`);
		}

		// Team mode (spec 17 and 18):
		//   random - the bot builds its own team (default)
		//   mirror - the bot uses a copy of your team
		//   swap   - the bot uses YOUR team and you get a random one, which is
		//            how you play against a team you built for it
		const teamMode = toID(rawTeamMode) || 'random';
		if (!['random', 'mirror', 'swap', 'custom'].includes(teamMode)) {
			return this.errorReply(`Team mode must be one of: random, mirror, swap, custom.`);
		}

		// A `team: 'random'` format builds both teams itself.
		const generatesTeams = !!format.team;
		const ownTeam = user.battleSettings.team;
		if (teamMode !== 'random' && !generatesTeams && !ownTeam) {
			return this.errorReply(
				`Pick a team in the Teambuilder first - "${teamMode}" needs a team to copy.`
			);
		}

		// Both teams are player input reaching the battle engine, so both are
		// validated here - and a refusal always says whose team it was about.
		// A battle that does not start has to say why: silence looks exactly
		// like "the bot refuses to fight me".
		if (!generatesTeams && ownTeam) {
			const problems = TeamValidator.get(format.id).validateTeam(Teams.unpack(ownTeam));
			if (problems) {
				return this.errorReply(`Your team cannot battle: ${problems.join(' ')}`);
			}
		}

		let preparedBotTeam: string | undefined;
		let megaSpecies: string[] = [];
		if (teamMode === 'custom' && !generatesTeams) {
			const prepared = botTeams.get(user.id);
			if (!prepared) {
				return this.errorReply(
					`The bot has no team, so there is nothing to battle against. ` +
					`Pick one under "The bot's team" and press Start battle again.`
				);
			}
			preparedBotTeam = prepared.team;
			megaSpecies = prepared.megaSpecies;
			const problems = TeamValidator.get(format.id).validateTeam(Teams.unpack(preparedBotTeam));
			if (problems) {
				return this.errorReply(`The bot's team cannot battle: ${problems.join(' ')}`);
			}
		}

		const playerTeam = generatesTeams ? undefined :
			(teamMode === 'swap' ? randomFakemonTeam(format) : (ownTeam || undefined));
		const botTeam = generatesTeams ? undefined : (
			teamMode === 'custom' ? preparedBotTeam :
			teamMode === 'random' ? randomFakemonTeam(format) : ownTeam
		);

		const battleRoom = Rooms.createBattle({
			format: format.id,
			players: [{ user, team: playerTeam, hidden: false, inviteOnly: false }],
			// p2 is played by the AI: RoomBattle fills the slot and drives it.
			bots: {
				p2: {
					name: botName, team: botTeam,
					bot: new FakemonBot({ name: botName, difficulty, megaSpecies }),
				},
			},
			isPrivate: true,
		});
		if (!battleRoom) return this.errorReply(`Could not start the battle.`);

		this.sendReply(
			`Started a ${format.name} battle against ${botName} (${difficulty}, ${teamMode} team).`
		);
	},
	fakemonbotteam(target, room, user) {
		this.checkChat();
		const input = target.trim();
		if (!input) {
			botTeams.delete(user.id);
			return this.sendReply(`Cleared the team you had prepared for the bot.`);
		}
		const { team: packed, megaSpecies } = parseBotTeam(input);
		const team = Teams.unpack(packed);
		if (!team?.length) return this.errorReply(`That is not a readable packed team.`);
		const known = new Set<string>(team.map(set => toID(set.species || set.name)));
		const unknown = megaSpecies.filter(id => !known.has(id));
		if (unknown.length) {
			return this.errorReply(`Not on that team, so it cannot Mega Evolve: ${unknown.join(', ')}.`);
		}
		botTeams.set(user.id, { team: packed, megaSpecies });
		this.sendReply(
			`Stored a ${team.length}-Pokemon team for the bot` +
			(megaSpecies.length === 1 ? `; it will always Mega Evolve ${megaSpecies[0]}.` :
			megaSpecies.length ? `; it may Mega Evolve ${megaSpecies.join(', ')}.` :
			`; it may Mega Evolve whichever it likes.`)
		);
	},
	fakemonbotteamhelp: [
		`/fakemonbotteam [megas=ids;][packed team] - Hand the bot a team you built, for /fakemonbot's "custom" mode.`,
		`The optional megas= list names which of them may Mega Evolve; with exactly one named it always will.`,
		`Sending it without a team forgets the stored one. The built-in client does this for you.`,
	],

	fakemonbothelp: [
		`/fakemonbot [format], [bot name], [team mode], [difficulty] - Battle a bot.`,
		`format: singles (default), doubles, random, randomdoubles`,
		`team mode: random (bot builds its own team, default), mirror (bot copies your team),`,
		`  swap (the bot uses the team you built and you get a random one),`,
		`  custom (you build both teams - send the bot's with /fakemonbotteam first)`,
		`difficulty: easy, normal (default), hard`,
		`Example: /fakemonbot doubles, ShadowMaster, random, hard`,
	],

	fakemonversion(target, room, user) {
		// The quickest answer to "is the server actually running the new code?".
		const index = FakemonIndex as AnyObject;
		const dex = Dex.mod('fakemon');
		dex.includeData();
		this.sendReplyBox(
			`<strong>Fakemon build</strong><br />` +
			`${Object.keys(dex.data.Pokedex).length} Pok&eacute;mon, ` +
			`${Object.keys(dex.data.Moves).length} moves, ` +
			`${Object.keys(dex.data.Items).length} items, ` +
			`${Object.keys(dex.data.Abilities).length - 1} abilities<br />` +
			`Effect setters: ${(index.effectMoves || []).length ? (index.effectMoves as string[]).join(', ') : 'none - this is an old build'}`
		);
	},
	fakemonversionhelp: [
		`/fakemonversion - What data this server is actually running, to check a rebuild arrived.`,
	],

	fakemonchallenge(target, room, user) {
		this.checkChat();
		const [rawTarget, rawFormat] = target.split(',').map(part => part.trim());
		if (!rawTarget) return this.parse('/help fakemonchallenge');
		const format = resolveFormat(rawFormat || 'singles');
		if (!format) return this.errorReply(`Unknown Fakemon format "${rawFormat}".`);
		// Hand off to Showdown's own challenge system, which already handles
		// invites, accepting and the private battle room.
		return this.parse(`/challenge ${rawTarget}, ${format.name}`);
	},
	fakemonchallengehelp: [
		`/fakemonchallenge [username], [format] - Challenge a friend to a Fakemon battle.`,
		`format: singles (default), doubles, random, randomdoubles`,
	],

	fakemondex(target, room, user) {
		if (!this.runBroadcast()) return;
		const query = toID(target);
		if (!query) return this.parse('/help fakemondex');
		const dex = Dex.mod('fakemon');
		dex.includeData();

		const species = dex.species.get(query);
		if (species.exists) {
			const stats = species.baseStats;
			const bst = Object.values(stats).reduce((a, b) => a + b, 0);
			const abilities = Object.entries(species.abilities)
				.map(([slot, name]) => `${name}${slot === 'H' ? ' (hidden)' : ''}`).join(', ');
			const mega = (FakemonIndex.megas as Record<string, AnyObject>)[species.id];
			const megaLine = mega ?
				`<br />Mega Stone: <b>${mega.stone}</b> &rarr; ${mega.forme} (Mega Ability: ${mega.ability})` :
				`<br />No Mega Stone: Mega Evolving gives +20 to every base stat.`;
			return this.sendReplyBox(
				`<b>${species.name}</b> - ${species.types.join(' / ')}<br />` +
				`HP ${stats.hp} / Atk ${stats.atk} / Def ${stats.def} / ` +
				`SpA ${stats.spa} / SpD ${stats.spd} / Spe ${stats.spe} (BST ${bst})<br />` +
				`Abilities: ${abilities}${megaLine}`
			);
		}

		const move = dex.moves.get(query);
		if (move.exists) {
			return this.sendReplyBox(
				`<b>${move.name}</b> - ${move.type} ${move.category}<br />` +
				`Power ${move.basePower || '-'} / Accuracy ${move.accuracy === true ? '-' : move.accuracy} / ` +
				`PP ${move.pp} / Priority ${move.priority}<br />` +
				`Target: ${move.target}<br />${Utils.escapeHTML(describe(dex.data.Moves[move.id]))}`
			);
		}

		const ability = dex.abilities.get(query);
		if (ability.exists) {
			const isMega = Object.keys(FakemonIndex.megaAbilities).includes(ability.id);
			return this.sendReplyBox(
				`<b>${ability.name}</b>${isMega ? ' <i>(Mega Ability)</i>' : ''}<br />` +
				Utils.escapeHTML(describe(dex.data.Abilities[ability.id]))
			);
		}

		const item = dex.items.get(query);
		if (item.exists) {
			return this.sendReplyBox(
				`<b>${item.name}</b><br />${Utils.escapeHTML(describe(dex.data.Items[item.id]))}`
			);
		}

		return this.errorReply(
			`"${target.trim()}" is not part of the Fakemon system. ` +
			`Original Pokémon Showdown data is not available here.`
		);
	},
	fakemondexhelp: [
		`/fakemondex [name] - Look up a Fakemon, move, ability, item or Mega Stone.`,
	],

	fakemonreport(target, room, user) {
		if (!this.runBroadcast()) return;
		const dex = Dex.mod('fakemon');
		dex.includeData();
		const megas = Object.keys(FakemonIndex.megas).length;
		return this.sendReplyBox(
			`<b>Fakemon system</b><br />` +
			`${FakemonIndex.baseSpecies.length} Pokémon (+${megas} Mega formes)<br />` +
			`${FakemonIndex.genericMoves.length + Object.keys(FakemonIndex.signatureMoves).length} moves ` +
			`(${Object.keys(FakemonIndex.signatureMoves).length} signature)<br />` +
			`${Object.keys(FakemonIndex.abilities).length} abilities ` +
			`(+${Object.keys(FakemonIndex.megaAbilities).length} Mega abilities)<br />` +
			`${Object.keys(dex.data.Items).length} items, including ${megas} Mega Stones<br />` +
			`Run <code>node tools/fakemon/check.js</code> for the full data check.`
		);
	},
};
