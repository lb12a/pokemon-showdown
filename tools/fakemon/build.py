"""Generate the Fakemon mod's data files from the parsed source material.

Outputs (all under data/mods/fakemon/generated/):
  pokedex.ts        every custom species, including the -Mega formes
  moves-generic.ts  the 730 moves from the move PDF + xlsx move database
  learnsets.ts      role-aware learnsets
  formats-data.ts   tiers
  index.ts          machine-readable inventory used by tests and the data check

Anything this script has to invent (base stats, PP, contact flags, learnsets,
the split of the Mega +100 across stats) is derived deterministically from the
source data so regenerating never reshuffles the dex. See DATA_GUIDE.md.
"""
import hashlib
import json
import os
import re
import sys

import effects

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'mods', 'fakemon', 'generated')

TYPES = ['Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison',
         'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark',
         'Steel', 'Fairy']


def toID(text):
    return re.sub(r'[^a-z0-9]+', '', (text or '').lower())


def seeded(*parts):
    """Deterministic 0..1 value from the given strings."""
    h = hashlib.sha256('|'.join(str(p) for p in parts).encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


# ---------------------------------------------------------------------------
# Base stat generation
# ---------------------------------------------------------------------------
# The dex PDF specifies no base stats, so they are derived from each line's own
# text: the archetype keywords below decide how a stage's BST is distributed.
ARCHETYPE_KEYWORDS = {
    'atk': ['attack', 'physical', 'punch', 'claw', 'fang', 'bite', 'slash', 'smash',
            'crush', 'bash', 'ram', 'kick', 'strike', 'melee', 'contact'],
    'spa': ['sp.atk', 'sp. atk', 'special attack', 'special', 'beam', 'pulse',
            'blast', 'burst', 'aura', 'psychic', 'spore', 'mind'],
    'def': ['defense', 'def ', 'protect', 'shield', 'armor', 'wall', 'shelter',
            'fortress', 'guard', 'blocks'],
    'spd': ['sp.def', 'sp. def', 'special defense', 'veil', 'screen', 'mist'],
    'spe': ['speed', 'initiative', 'priority', 'faster', 'swift', 'dash', 'sprint',
            'flutter', 'rush'],
    'hp': ['heals', 'healing', 'regenerat', 'max.hp', 'max hp', 'recover', 'bulk'],
}

# BSTs by evolution stage. Single-stage species sit between the two.
BST_BY_STAGE = {'basic': 320, 'middle': 420, 'final': 520, 'solo': 500}
HEIGHT_BY_STAGE = {'basic': 0.5, 'middle': 1.1, 'final': 1.8, 'solo': 1.5}
WEIGHT_BY_STAGE = {'basic': 12.0, 'middle': 40.0, 'final': 95.0, 'solo': 70.0}


def archetype_weights(family):
    """Weight each stat by how often the family's own text talks about it."""
    blob = ' '.join(
        [m['name'] + ' ' + m['desc'] for m in family['moves']] +
        [a['name'] + ' ' + a['desc'] for a in family['abilities']] +
        [a['name'] + ' ' + a['desc'] for a in family['megaAbilities']]
    ).lower()
    weights = {}
    for stat, words in ARCHETYPE_KEYWORDS.items():
        weights[stat] = 1.0 + sum(blob.count(w) for w in words) * 0.45
    # Types nudge the classic physical/special split.
    types = family['species'][0]['types']
    for t in types:
        if t in ('Fighting', 'Rock', 'Ground', 'Steel', 'Bug'):
            weights['atk'] += 0.6
            weights['def'] += 0.3
        if t in ('Psychic', 'Fire', 'Electric', 'Ghost', 'Dragon', 'Fairy'):
            weights['spa'] += 0.6
        if t in ('Flying', 'Electric', 'Dark'):
            weights['spe'] += 0.5
        if t in ('Steel', 'Rock', 'Grass', 'Water'):
            weights['def'] += 0.4
            weights['spd'] += 0.3
    return weights


def make_base_stats(name, family, stage):
    """HP gets its own reserved share (14-20% of the BST) so no species ends up
    with a nonsensical HP stat; the rest is split by archetype weight."""
    weights = archetype_weights(family)
    bst = BST_BY_STAGE[stage]
    hp = round(bst * (0.14 + 0.06 * seeded(name, 'hp')))
    remaining = bst - hp
    jitter = {s: 0.82 + 0.36 * seeded(name, s) for s in weights}
    offense = ('atk', 'def', 'spa', 'spd', 'spe')
    scored = {s: weights[s] * jitter[s] for s in offense}
    total = sum(scored.values())
    stats = {'hp': hp}
    for s in offense:
        stats[s] = max(25, min(190, round(remaining * scored[s] / total)))
    drift = bst - sum(stats.values())
    order = sorted(offense, key=lambda s: -stats[s])
    i = 0
    while drift and i < 500:
        s = order[i % len(order)]
        step = 1 if drift > 0 else -1
        if 25 <= stats[s] + step <= 190:
            stats[s] += step
            drift -= step
        i += 1
    return stats


def mega_stats(base, name):
    """A Mega Stone must be worth exactly +100 BST (spec section 10).

    The +100 is pushed into the forme's strongest stats, never into HP - a Mega
    that changed max HP mid-battle would desync the HP bar.
    """
    order = sorted(('atk', 'def', 'spa', 'spd', 'spe'),
                   key=lambda s: (-base[s], s))
    shares = [40, 25, 15, 12, 8]
    # rotate slightly per species so not every Mega has the same shape
    rot = int(seeded(name, 'mega') * len(shares))
    shares = shares[rot:] + shares[:rot]
    out = dict(base)
    for stat, share in zip(order, shares):
        out[stat] = base[stat] + share
    assert sum(out.values()) - sum(base.values()) == 100, name
    return out


# ---------------------------------------------------------------------------
# Move emission
# ---------------------------------------------------------------------------
CONTACT_WORDS = ['punch', 'kick', 'slam', 'strike', 'bash', 'crush', 'claw', 'slash',
                 'bite', 'fang', 'tackle', 'headbutt', 'ram', 'charge', 'dive',
                 'pounce', 'stomp', 'smash', 'chop', 'jab', 'hammer', 'tail',
                 'body', 'grip', 'grab', 'lariat', 'sever', 'snap', 'peck',
                 'dash', 'rush', 'step', 'toss', 'sting', 'clap', 'crash',
                 'drill', 'dance', 'roll', 'whip', 'swipe', 'cut', 'horn',
                 'wing', 'kiss', 'hopper', 'hug', 'tap', 'gnaw', 'lick', 'sprint']
NONCONTACT_WORDS = ['beam', 'blast', 'shot', 'bomb', 'wave', 'pulse', 'cannon',
                    'missile', 'spike', 'ray', 'burst', 'breath', 'gust', 'wind',
                    'storm', 'field', 'aura', 'call', 'song', 'cry', 'screech',
                    'roar', 'howl', 'shower', 'spray', 'geyser', 'launcher']
SOUND_WORDS = ['sound', 'echo', 'sonic', 'song', 'cry', 'roar', 'screech', 'howl',
               'melody', 'hum', 'pulse wave', 'vocal', 'trumpet', 'noise',
               'symphon', 'audio', 'bass', 'shriek', 'voice', 'boom bass']
PUNCH_WORDS = ['punch', 'jab', 'fist', 'uppercut']
BITE_WORDS = ['bite', 'fang', 'chomp', 'crunch', 'gnaw', 'nibble']
BULLET_WORDS = ['bomb', 'ball', 'bullet', 'missile', 'cannon', 'shot', 'sphere',
                'spere', 'orb', 'pellet', 'seed']
POWDER_WORDS = ['spore', 'powder', 'pollen', 'dust']


def has_word(name, words):
    n = name.lower()
    return any(w in n for w in words)


def move_flags(move, spec):
    """Showdown flags. Contact is inferred from the move's name and category
    because the source files do not record it."""
    name = move['name']
    cat = move['category']
    flags = {}
    if cat != 'Status':
        contact = has_word(name, CONTACT_WORDS) and not has_word(name, NONCONTACT_WORDS)
        if cat == 'Physical' and not has_word(name, NONCONTACT_WORDS):
            contact = True
        if contact:
            flags['contact'] = 1
    flags['protect'] = 1
    flags['mirror'] = 1
    if has_word(name, SOUND_WORDS):
        flags['sound'] = 1
        flags['bypasssub'] = 1
        flags.pop('contact', None)
    if has_word(name, PUNCH_WORDS):
        flags['punch'] = 1
    if has_word(name, BITE_WORDS):
        flags['bite'] = 1
    if has_word(name, BULLET_WORDS):
        flags['bullet'] = 1
        flags.pop('contact', None)
    if has_word(name, POWDER_WORDS):
        flags['powder'] = 1
        flags.pop('contact', None)
    if 'heal' in spec.fields or 'Heals' in (move.get('effect') or ''):
        flags['heal'] = 1
    if cat == 'Status' and spec.fields.get('target') == "'self'":
        flags['snatch'] = 1
    for extra in spec.fields.get('flags_extra', []):
        flags[extra] = 1
    if spec.fields.get('breaksProtect'):
        flags.pop('protect', None)
    if spec.fields.get('stallingMove'):
        flags = {'noassist': 1}
    return flags


def default_pp(move, spec):
    """PP is absent from every source file, so it is derived from power."""
    bp = move['basePower']
    if move['category'] == 'Status':
        strong = any(k in spec.fields for k in
                     ('heal', 'weather', 'pseudoWeather', 'sideCondition', 'status'))
        return 10 if strong else 20
    if bp <= 45:
        return 30
    if bp <= 65:
        return 25
    if bp <= 80:
        return 15
    if bp <= 100:
        return 10
    return 5


def ts_value(v, indent=1):
    pad = '\t' * indent
    if isinstance(v, str):
        return v
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, dict):
        if not v:
            return '{}'
        inner = ', '.join(f'{k}: {ts_value(x, indent)}' for k, x in v.items())
        return '{ ' + inner + ' }'
    if isinstance(v, list):
        return '[' + ', '.join(ts_value(x, indent) for x in v) + ']'
    raise TypeError(v)


def emit_secondary(sec, indent=2):
    pad = '\t' * indent
    parts = []
    for k, v in sec.items():
        if k == 'boosts':
            parts.append(f'boosts: {ts_value(v)}')
        elif k == 'self':
            inner = ', '.join(f'{ik}: {ts_value(iv)}' for ik, iv in v.items())
            parts.append('self: { ' + inner + ' }')
        else:
            parts.append(f'{k}: {ts_value(v)}')
    return '{ ' + ', '.join(parts) + ' }'


# --------------------------------------------------------------------------
# Move targets
# --------------------------------------------------------------------------
# The generic rule - "a Status move that does not boost anybody else targets
# itself" - is right for buffs and shields, but it silently breaks every move
# whose written effect has to reach somebody else: the move resolves against
# the user, so disabling, trapping, type changes and forced switches all hit
# the wrong Pokemon or do nothing at all. `resolve_target` fixes the structural
# cases automatically and `TARGET_FIXUPS` names the moves whose effect text
# disagrees with the generic rule.
TARGET_FIXUPS = {
    # status moves whose effect text names the opponent
    'blankstare': "'normal'", 'routinecheck': "'normal'", 'boringlecture': "'normal'",
    'equalize': "'normal'", 'smolder': "'normal'", 'rootbind': "'normal'",
    'sparringmatch': "'normal'", 'grapple': "'normal'", 'contaminate': "'normal'",
    'quicksand': "'normal'", 'mudpit': "'normal'", 'memorywipe': "'normal'",
    'mindread': "'normal'", 'pheromonecloud': "'normal'", 'webtrap': "'normal'",
    'fossilize': "'normal'", 'possession': "'normal'", 'spiritlink': "'normal'",
    'possess': "'normal'", 'voodoodoll': "'normal'", 'shadownet': "'normal'",
    'deception': "'normal'", 'falsepromise': "'normal'", 'pixiedust': "'normal'",
    'enchantment': "'normal'", 'magicwand': "'normal'", 'glamour': "'normal'",
    'submissionhold': "'normal'", 'rust': "'normal'", 'algaebloom': "'normal'",
    # a heal aimed at "the target" is aimed at the team, not at the opponent
    'nectarheal': "'adjacentAllyOrSelf'",
}


# A damaging move has to be able to reach a Pokemon. Several effect rules were
# written for status moves and set one of these targets along with their
# payload; on a move that also deals damage the attack would then hit nothing
# (or the user), so the target is corrected and the payload moves into `self`.
NON_ATTACKING_TARGETS = {"'self'", "'allySide'", "'allyTeam'", "'foeSide'", "'all'"}


def resolve_target(move, spec):
    """The target a move really needs, not the one the generic rule guesses."""
    move_id = toID(move['name'])
    damaging = move['category'] != 'Status'
    if move_id in TARGET_FIXUPS:
        fixed = TARGET_FIXUPS[move_id]
        return "'normal'" if damaging and fixed in NON_ATTACKING_TARGETS else fixed
    if spec.fields.get('target'):
        if damaging and spec.fields['target'] in NON_ATTACKING_TARGETS:
            return "'normal'"
        return spec.fields['target']
    f = spec.fields
    if f.get('onHitField'):
        return "'all'"          # onHitField only runs for a field-wide target
    if f.get('forceSwitch'):
        return "'normal'"       # you cannot force yourself out
    if move['category'] == 'Status' and (f.get('weather') or f.get('pseudoWeather') or
                                         f.get('terrain')):
        return "'all'"
    if move['category'] != 'Status' or spec.target_boosts or f.get('status'):
        return "'normal'"
    return "'self'"


# --------------------------------------------------------------------------
# Effect-text coverage
# --------------------------------------------------------------------------
# `spec.unmatched` only says whether *some* rule fired. A sentence like
# "Eliminates all Terrains, paralyzes all grounded targets" used to compile the
# first half and drop the second, which shipped a move that only did half of
# what it says. This measures how much of each effect string the rules actually
# consumed, so those half-implemented moves are visible.
COVERAGE_FILLER = {
    'and', 'the', 'for', 'with', 'that', 'this', 'its', 'their', 'them', 'also',
    'per', 'turn', 'turns', 'all', 'any', 'when', 'while', 'from', 'into', 'has',
    'have', 'are', 'was', 'but', 'not', 'may', 'can', 'each', 'every', 'used',
    'user', 'target', 'move', 'moves', 'pokemon', 'pok', 'mon', 'damage', 'hit',
    'hits', 'stat', 'stage', 'stages', 'chance', 'effect', 'effects',
}

# Text that is deliberately not compiled, with the reason.
COVERAGE_ALLOWLIST = {
    'Magma Geyser': 'no semi-invulnerable moves in this game (Dive/Dig)',
    'Mystic Sword': 'the parenthetical repeats overrideOffensiveStat',
    'Telepathic Blast': 'the parenthetical repeats overrideOffensiveStat',
    'Marble Roll': 'the parenthetical repeats the weight-ignoring volatile',
    'Routine Strike': 'the cap is already in the basePowerCallback',
    'Gust Blade': 'the screen list repeats "Ignores Reflect"',
    'Aura Wave': 'the screen list repeats "Bypasses screens"',
    'Fault Breaker': 'the parenthetical lists the rooms it already clears',
    'Possession': 'Encore is the closest engine mechanic to "controls its move"',
    'Ice Slick': 'the recoil and Speed drop live in the fakemoniceslick condition',
    'Icicle Barrier': 'Spiky Shield already is the 1/8 contact punish',
    'Fae Shield': 'Magic Coat already is the status-move reflection',
    'Aero Shield': 'the 1/4 special damage lives in the fakemonaeroshield condition',
    'Vandalize': 'the hazard sweep is in the compiled onAfterHit',
}


def effect_text_gaps(move):
    """Words of a move's effect text that no rule consumed."""
    text = (move.get('effect') or '').strip()
    if not text or text.lower().startswith('no additional effect'):
        return []
    covered = [False] * len(text)
    taken = []
    for regex, _fn in effects.RULES:
        for m in regex.finditer(text):
            if any(m.start() >= a and m.end() <= b for a, b in taken):
                continue
            taken.append((m.start(), m.end()))
    for a, b in taken:
        for i in range(a, b):
            covered[i] = True
    leftover = ''.join(' ' if covered[i] else c for i, c in enumerate(text))
    words = [w for w in re.split(r'[^A-Za-z0-9%/-]+', leftover) if len(w) > 2]
    return [w for w in words if w.lower() not in COVERAGE_FILLER]


def build_move(num, move, source):
    spec = effects.compile_effect(move, move.get('effect'))
    rule_target = spec.fields.get('target')
    spec.fields['target'] = resolve_target(move, spec)
    # True when the rule aimed its payload at the user or a side, but the move
    # deals damage and had to be pointed at somebody else.
    redirected = (move['category'] != 'Status' and
                  rule_target in NON_ATTACKING_TARGETS and
                  spec.fields['target'] != rule_target)
    name = move['name']
    fields = {}
    fields['num'] = num
    acc = move['accuracy']
    # NB: in Python `True` is an int, so the bool check has to come first.
    if (spec.fields.get('accuracy') == 'true' or acc is True or
            (move['category'] == 'Status' and acc in (None, 0))):
        fields['accuracy'] = 'true'
    else:
        fields['accuracy'] = acc if isinstance(acc, int) else 'true'
    fields['basePower'] = move['basePower'] if move['category'] != 'Status' else 0
    fields['category'] = f'"{move["category"]}"'
    fields['name'] = f'"{name}"'
    fields['pp'] = default_pp(move, spec)
    fields['priority'] = spec.fields.get('priority', 0)
    fields['flags'] = ts_value(move_flags(move, spec))

    # xlsx columns that the effect text does not repeat
    if source == 'xlsx':
        if move.get('critRatio') and move['critRatio'] > 1:
            spec.set('critRatio', move['critRatio'])
        if move.get('recoil'):
            spec.set('recoil', f"[{int(move['recoil'])}, 100]")
        if move.get('drain'):
            spec.set('drain', f"[{int(move['drain'])}, 100]")
        if move.get('multiHitMin') and move.get('multiHitMax'):
            spec.set('multihit', f"[{int(move['multiHitMin'])}, {int(move['multiHitMax'])}]")
        if move.get('alwaysHits') or move.get('ignoreAccuracy'):
            fields['accuracy'] = 'true'
        if move.get('priority'):
            fields['priority'] = int(move['priority'])

    passthrough = ['critRatio', 'drain', 'recoil', 'heal', 'multihit', 'volatileStatus',
                   'status', 'sideCondition', 'pseudoWeather', 'weather', 'selfSwitch',
                   'forceSwitch', 'selfdestruct', 'breaksProtect', 'ignoreImmunity',
                   'ignoreScreens', 'ignoreDefensive', 'ignoreEvasion', 'ignoreAbility',
                   'overrideOffensiveStat', 'overrideDefensiveStat', 'stallingMove',
                   'self', 'condition']
    callbacks = ['basePowerCallback', 'damageCallback', 'onBasePower', 'onModifyMove',
                 'onModifyType', 'onModifyPriority', 'onModifyCritRatio', 'onEffectiveness',
                 'onTry', 'onTryHit', 'onTryMove', 'onPrepareHit', 'onHit', 'onHitField',
                 'onAfterHit', 'onAfterMove', 'onMoveFail']
    for key in passthrough:
        if key in spec.fields:
            fields[key] = spec.fields[key]
    if spec.self_boosts:
        # `boosts` applies to whoever the move targets, so a self-buff can only
        # go there when the move actually targets the user.
        if (move['category'] == 'Status' and not spec.target_boosts and
                spec.fields['target'] == "'self'"):
            fields['boosts'] = ts_value(spec.self_boosts)
        else:
            existing = fields.get('self')
            if existing:
                fields['self'] = existing[:-2] + ', boosts: ' + ts_value(spec.self_boosts) + ' }'
            else:
                fields['self'] = '{ boosts: ' + ts_value(spec.self_boosts) + ' }'
    if spec.target_boosts:
        if move['category'] == 'Status':
            fields['boosts'] = ts_value(spec.target_boosts)
        else:
            spec.add_secondary({'chance': 100, 'boosts': spec.target_boosts})
    for key in callbacks:
        if key in spec.fields:
            fields[key] = spec.fields[key]

    if spec.secondaries:
        if len(spec.secondaries) == 1:
            fields['secondary'] = emit_secondary(spec.secondaries[0])
        else:
            fields['secondaries'] = ('[\n\t\t' +
                                     ',\n\t\t'.join(emit_secondary(s) for s in spec.secondaries) +
                                     ',\n\t]')
    # `secondary: null` is not part of MoveData; the field is simply omitted.

    # `onAfterHit` only fires for moves that actually dealt damage, so on a
    # Status move it would be dead code - run the same body from `onHit`.
    if move['category'] == 'Status' and 'onAfterHit' in fields and 'onHit' not in fields:
        fields['onHit'] = fields.pop('onAfterHit')

    if redirected:
        # `volatileStatus` and an ally-side `sideCondition` land on the move's
        # target, which is now a foe - move them onto the user instead.
        selfish = {}
        for key in ('volatileStatus', 'selfSwitch'):
            if key in fields:
                selfish[key] = fields.pop(key)
        if 'sideCondition' in fields and rule_target in ("'allySide'", "'allyTeam'", "'self'"):
            selfish['sideCondition'] = fields.pop('sideCondition')
        if selfish:
            inner = ', '.join(f'{k}: {v}' for k, v in selfish.items())
            existing = fields.get('self')
            fields['self'] = (existing[:-2] + ', ' + inner + ' }') if existing else '{ ' + inner + ' }'
        # `onHitField` only runs for a field-wide target.
        if 'onHitField' in fields and 'onHit' not in fields:
            fields['onHit'] = fields.pop('onHitField')

    fields['target'] = spec.fields['target']
    fields['type'] = f'"{move["type"]}"'
    fields['contestType'] = '"Cool"'
    fields['desc'] = json.dumps(move.get('effect') or 'No additional effect.')
    fields['shortDesc'] = json.dumps((move.get('effect') or 'No additional effect.')[:120])
    return fields, spec


def render_entry(id_, fields, indent=1):
    pad = '\t' * indent
    lines = [f'{pad}{id_}: {{']
    for k, v in fields.items():
        if k == 'flags_extra':
            continue
        lines.append(f'{pad}\t{k}: {v},')
    lines.append(f'{pad}}},')
    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Species emission
# ---------------------------------------------------------------------------
EGG_GROUPS_BY_TYPE = {
    'Grass': 'Grass', 'Bug': 'Bug', 'Water': 'Water 1', 'Fire': 'Field',
    'Electric': 'Field', 'Ground': 'Field', 'Rock': 'Mineral', 'Steel': 'Mineral',
    'Ghost': 'Amorphous', 'Psychic': 'Human-Like', 'Fighting': 'Human-Like',
    'Dark': 'Field', 'Dragon': 'Dragon', 'Fairy': 'Fairy', 'Ice': 'Field',
    'Flying': 'Flying', 'Poison': 'Amorphous', 'Normal': 'Field',
}


def mega_stone_name(base_name):
    """Venusaur -> Venusaurite. Keeps the classic Mega Stone naming."""
    stem = base_name.replace('-', '').replace(' ', '')
    if stem.lower().endswith('e'):
        stem = stem[:-1]
    return stem + 'ite'


def stage_of(index, count, is_mega):
    if is_mega:
        return 'final'
    if count == 1:
        return 'solo'
    if index == 0:
        return 'basic'
    if index == count - 1:
        return 'final'
    return 'middle'


def assign_abilities(family, members):
    """Spread the line's ability pool over its stages.

    Showdown has three usable ability slots, so lines that list more than three
    abilities hand the extras to their earlier stages; the final evolution always
    keeps the first two plus the last one.
    """
    pool = [a['name'] for a in family['abilities']]
    if not pool:
        pool = ['Adaptive Instinct']
    out = {}
    if len(pool) <= 3:
        slots = dict(zip(['0', '1', 'H'], pool))
        for m in members:
            out[m] = dict(slots)
        return out
    finals = [pool[0], pool[1], pool[-1]]
    extras = pool[2:-1]
    for i, m in enumerate(members):
        if i == len(members) - 1:
            chosen = finals
        else:
            start = (i * 2) % max(1, len(extras))
            chosen = ([pool[0]] + extras[start:start + 2])[:3]
            while len(chosen) < 2 and len(pool) > 1:
                chosen.append(pool[1])
        out[m] = {k: v for k, v in zip(['0', '1', 'H'], chosen) if v}
    return out


def build_species(families):
    """Return an ordered list of species dicts ready for emission."""
    out = []
    num = 1
    for family in families:
        plain = [s for s in family['species'] if '-Mega' not in s['name']]
        megas = [s for s in family['species'] if '-Mega' in s['name']]
        names = [s['name'] for s in plain]
        ability_map = assign_abilities(family, names)
        # Split evolutions branch off the previous stage rather than chaining.
        prev_by_stage = {}
        entries = {}
        for i, sp in enumerate(plain):
            stage = stage_of(i, len(plain), False)
            stats = make_base_stats(sp['name'], family, stage)
            entry = {
                'name': sp['name'], 'num': num, 'types': sp['types'],
                'baseStats': stats, 'abilities': ability_map[sp['name']],
                'weightkg': round(WEIGHT_BY_STAGE[stage] * (0.5 + 1.2 * seeded(sp['name'], 'weight')), 1),
                'heightm': round(HEIGHT_BY_STAGE[stage] * (0.75 + 0.5 * seeded(sp['name'], 'height')), 1),
                'eggGroups': [EGG_GROUPS_BY_TYPE.get(sp['types'][0], 'Field')],
                'color': 'Green', 'family': family, 'stage': stage,
                'splitEvo': sp.get('splitEvo'),
            }
            num += 1
            if i > 0:
                parent_stage = (sp['splitEvo'][0] - 1) if sp.get('splitEvo') else None
                parent = (prev_by_stage.get(parent_stage) if parent_stage is not None
                          else plain[i - 1]['name'])
                parent = parent or plain[i - 1]['name']
                entry['prevo'] = parent
                entry['evoLevel'] = 16 if i == 1 else 36
                entries[parent]['evos'] = entries[parent].get('evos', []) + [sp['name']]
            prev_by_stage[i] = sp['name']
            entries[sp['name']] = entry
            out.append(entry)
        for sp in megas:
            base_name = sp['name'].replace('-Mega', '')
            base = entries.get(base_name) or (out[-1] if out else None)
            if base is None:
                continue
            mega_ability = (family['megaAbilities'][0]['name']
                            if family['megaAbilities'] else base['abilities']['0'])
            out.append({
                'name': sp['name'], 'num': base['num'],
                'baseSpecies': base_name, 'forme': 'Mega',
                'types': sp['types'] or base['types'],
                'baseStats': mega_stats(base['baseStats'], sp['name']),
                'abilities': {'0': mega_ability},
                'weightkg': base['weightkg'], 'heightm': base['heightm'],
                'eggGroups': base['eggGroups'], 'color': base['color'],
                'requiredItemName': mega_stone_name(base_name),
                'family': family, 'stage': 'mega', 'isMega': True,
            })
    return out


# ---------------------------------------------------------------------------
# Design corrections
# ---------------------------------------------------------------------------
# The importer reads the dex PDF literally. These entries are deliberate
# changes made after that import, applied to the generated species *before*
# learnsets and tiers are built, so a re-typed Pokemon gets STAB for the type
# it actually has.
SPECIES_FIXUPS = {
    # Two coats with identical stats; each grows into the evolution that
    # matches its typing.
    'Tigitz': {
        'types': ['Normal', 'Fighting'],
        'baseForme': 'Brawler',
        'evos': ['Tigraxe'],
    },
    # Tigraith and Tigraxe are mirror images: the same spread with the physical
    # and special halves swapped, so the pair covers both sides of one idea.
    'Tigraith': {
        'types': ['Fairy', 'Ghost'],
        'baseStats': {'hp': 75, 'atk': 60, 'def': 70, 'spa': 140, 'spd': 85, 'spe': 90},
        'prevo': 'Tigitz-Fae',
        'evoLevel': 36,
    },
    'Tigraxe': {
        'types': ['Fighting', 'Fire'],
        'baseStats': {'hp': 75, 'atk': 140, 'def': 85, 'spa': 60, 'spd': 70, 'spe': 90},
        'prevo': 'Tigitz',
        'evoLevel': 36,
    },
    # Anxious (+3 priority under 25% HP) is a panicking-newborn trait: only the
    # first stage of the line keeps it.
    'Pompash': {'abilities': {'0': 'Rooted', '1': 'Fresh Air'}},
    'Pompomble': {'abilities': {'0': 'Rooted', '1': 'Fresh Air'}},
}

# Formes picked in the team builder rather than reached in battle. Each one
# inherits its base forme's entry and overrides what differs.
EXTRA_FORMES = [
    ('Tigitz', 'Fae', {
        'types': ['Normal', 'Fairy'],
        'evos': ['Tigraith'],
    }),
    # The crown and the axe are the legendary states: more of the offensive
    # stat than the base forme ever reaches, plus a third type.
    ('Tigraith', 'Crowned', {
        'types': ['Fairy', 'Ghost', 'Ice'],
        'baseStats': {'hp': 85, 'atk': 65, 'def': 85, 'spa': 165, 'spd': 100, 'spe': 100},
    }),
    # Same total as Crowned, with every point of bulk spent on speed and
    # special offence.
    ('Tigraith', 'Hypercrowned', {
        'types': ['Fairy', 'Ghost', 'Ice'],
        'baseStats': {'hp': 70, 'atk': 65, 'def': 60, 'spa': 190, 'spd': 70, 'spe': 145},
    }),
    ('Tigraxe', 'Axed', {
        'types': ['Fighting', 'Fire', 'Steel'],
        'baseStats': {'hp': 85, 'atk': 165, 'def': 100, 'spa': 65, 'spd': 85, 'spe': 100},
    }),
    ('Tigraxe', 'Hyperaxed', {
        'types': ['Fighting', 'Fire', 'Steel'],
        'baseStats': {'hp': 70, 'atk': 190, 'def': 70, 'spa': 65, 'spd': 60, 'spe': 145},
    }),
]

# Three coats told apart by a handful of stat points rather than by typing or
# ability. The first entry is the line's default forme, so each line has
# exactly three variants and not a nameless fourth. Twelve points move into the
# coat's own stat and six come out of each of the other two, so every forme
# keeps the total it had.
DOG_COATS = [
    ('Bobtail', {'def': 12, 'atk': -6, 'spe': -6}),
    ('Beagle', {'atk': 12, 'def': -6, 'spe': -6}),
    ('Dalmatian', {'spe': 12, 'atk': -6, 'def': -6}),
]
DOG_LINES = ['Budpup', 'Budruff', 'Mudruff']


def shift_stats(stats, deltas):
    out = dict(stats)
    for stat, delta in deltas.items():
        out[stat] += delta
    return out


def apply_species_fixups(species):
    """Rewrite generated species and append the hand-designed formes."""
    by_name = {sp['name']: sp for sp in species}

    for name, changes in SPECIES_FIXUPS.items():
        if name not in by_name:
            raise SystemExit(f'SPECIES_FIXUPS names an unknown Pokemon: {name}')
        by_name[name].update(changes)

    def new_forme(base_name, forme_name, changes):
        base = by_name[base_name]
        entry = dict(base)
        entry.update({
            'name': f'{base_name}-{forme_name}',
            'baseSpecies': base_name,
            'forme': forme_name,
            'otherFormes': None, 'formeOrder': None,
        })
        entry.pop('prevo', None)
        entry.pop('evoLevel', None)
        entry.pop('evos', None)
        entry.update(changes)
        return entry

    extra = []
    formes_of = {}
    for base_name, forme_name, changes in EXTRA_FORMES:
        if base_name not in by_name:
            raise SystemExit(f'EXTRA_FORMES names an unknown Pokemon: {base_name}')
        entry = new_forme(base_name, forme_name, changes)
        formes_of.setdefault(base_name, []).append(entry['name'])
        extra.append(entry)

    # The dog lines: the base entry becomes the first coat, the other two are
    # formes that evolve into the matching coat of the next stage.
    for line in DOG_LINES:
        base = by_name.get(line)
        if not base:
            raise SystemExit(f'DOG_LINES names an unknown Pokemon: {line}')
        default_name, default_deltas = DOG_COATS[0]
        plain_stats = dict(base['baseStats'])
        base['baseForme'] = default_name
        base['baseStats'] = shift_stats(plain_stats, default_deltas)
        for coat, deltas in DOG_COATS[1:]:
            entry = new_forme(line, coat, {'baseStats': shift_stats(plain_stats, deltas)})
            if base.get('prevo'):
                entry['prevo'] = f"{base['prevo']}-{coat}"
                entry['evoLevel'] = base.get('evoLevel', 16)
            if base.get('evos'):
                entry['evos'] = [f'{evo}-{coat}' for evo in base['evos']]
            formes_of.setdefault(line, []).append(entry['name'])
            extra.append(entry)

    for base_name, formes in formes_of.items():
        by_name[base_name]['otherFormes'] = formes
        by_name[base_name]['formeOrder'] = [base_name] + formes

    # Keep each forme next to the Pokemon it belongs to.
    out = []
    for sp in species:
        out.append(sp)
        for entry in extra:
            if entry['baseSpecies'] == sp['name']:
                out.append(entry)
    return out


def render_species(entry):
    fields = {}
    fields['num'] = entry['num']
    fields['name'] = json.dumps(entry['name'])
    fields['types'] = json.dumps(entry['types'])
    if entry.get('baseSpecies'):
        fields['baseSpecies'] = json.dumps(entry['baseSpecies'])
        fields['forme'] = json.dumps(entry['forme'])
    if entry.get('baseForme'):
        fields['baseForme'] = json.dumps(entry['baseForme'])
    if entry.get('otherFormes'):
        fields['otherFormes'] = json.dumps(entry['otherFormes'])
        fields['formeOrder'] = json.dumps(entry['formeOrder'])
    fields['baseStats'] = ts_value(entry['baseStats'])
    fields['abilities'] = '{ ' + ', '.join(
        f'{k}: {json.dumps(v)}' for k, v in entry['abilities'].items()) + ' }'
    fields['heightm'] = entry['heightm']
    fields['weightkg'] = entry['weightkg']
    fields['color'] = json.dumps(entry['color'])
    if entry.get('prevo'):
        fields['prevo'] = json.dumps(entry['prevo'])
        fields['evoLevel'] = entry['evoLevel']
    if entry.get('evos'):
        fields['evos'] = json.dumps(entry['evos'])
    fields['eggGroups'] = json.dumps(entry['eggGroups'])
    if entry.get('requiredItemName'):
        fields['requiredItem'] = json.dumps(entry['requiredItemName'])
        fields['battleOnly'] = json.dumps(entry['baseSpecies'])
    return fields


# ---------------------------------------------------------------------------
# Learnsets
# ---------------------------------------------------------------------------
# The dex PDF only guarantees each line's own signature moves ("auf jeden Fall
# gelernte Attacken"), so the rest of every learnset is chosen here by role.
SUPPORT_HINTS = ('sideCondition', 'weather', 'pseudoWeather', 'heal', 'boosts',
                 'forceSwitch', 'selfSwitch')


def move_role(entry):
    """Classify a generic move so learnsets stay thematically sane."""
    if entry['category'] == 'Status':
        return 'status'
    return 'physical' if entry['category'] == 'Physical' else 'special'


# ---------------------------------------------------------------------------
# Ability synergy
# ---------------------------------------------------------------------------
# Several abilities only pay off with a particular kind of move - Slowmofly
# stretches the field effects its owner sets, Trunk Launcher wants a bullet
# move, Timber Fall wants something weight-based. Generating a learnset purely
# from typing and stats left plenty of those Pokemon with no way to use their
# own ability, so every entry below names what its ability rewards and the
# learnset builder guarantees a few of them.
#
# Kinds:
#   type:X      moves of that type          category:X  Physical / Special / Status
#   flag:X      a move flag (contact, sound, bullet, bite, punch, slicing)
#   weight      weight-based moves          field       sets weather/terrain/room/screen/hazard
#   priority    positive priority           recoil      has recoil
#   multihit    hits several times          protect     a protecting move
#   spinning    rolling or spinning         lowbp       60 base power or less
#   paralyze    can paralyse
ABILITY_SYNERGY = {
    'acidicpigment': ['type:Poison'],
    'aerodynamicheavyweight': ['weight'],
    'aftershock': ['type:Ground'],
    'ampedup': ['paralyze'],
    'athenasdecree': ['type:Flying'],
    'blastproof': ['recoil'],
    'bonegrip': ['type:Ghost'],
    'brickwall': ['protect'],
    'centrifugalforce': ['spinning', 'weight'],
    'chloroplastmind': ['type:Psychic', 'field'],
    'cinderboost': ['type:Fire'],
    'conductortongue': ['type:Electric'],
    'conestorage': ['flag:bullet'],
    'cooking': ['flag:contact'],
    'corrosivegrip': ['flag:contact'],
    'deeprootreflex': ['type:Ground'],
    'desertgrappler': ['field'],
    'echodrain': ['flag:sound'],
    'electriccarousel': ['type:Electric'],
    'electricteeth': ['flag:bite'],
    'firestarter': ['type:Fire'],
    'fossilizedwings': ['type:Flying'],
    'grassstarter': ['type:Grass'],
    'heliumvoice': ['flag:sound'],
    'huntinginstinct': ['flag:contact'],
    'hydromechanics': ['type:Water'],
    'inductioncharge': ['type:Electric'],
    'inflaming': ['type:Fire'],
    'kamikaze': ['recoil'],
    'mindfocus': ['category:Status'],
    'mudlover': ['type:Water'],
    'mudrush': ['type:Ground', 'field'],
    'nibble': ['flag:contact'],
    'overcharge': ['type:Electric'],
    'pinpointneedle': ['flag:slicing'],
    'powergrid': ['type:Electric'],
    'rainbowcake': ['category:Special'],
    'resonanceshell': ['field'],
    'seismicforce': ['type:Ground', 'flag:punch'],
    'slicingmassacre': ['category:Special'],
    'slowmofly': ['field'],
    'sludgepile': ['flag:bite'],
    'sneakysting': ['priority'],
    'solarcharge': ['flag:sound', 'type:Electric', 'field'],
    'spatialcatalyst': ['field'],
    'staticflutter': ['type:Electric', 'type:Bug'],
    'sugarpile': ['flag:contact'],
    'symphonicshield': ['multihit'],
    'thundertail': ['type:Electric'],
    'timberfall': ['weight'],
    'toxicpalette': ['type:Normal'],
    'trunklauncher': ['flag:bullet'],
    'vanishstrike': ['lowbp'],
    'waterstarter': ['type:Water'],
}

FIELD_KEYS = ('weather', 'pseudoWeather', 'sideCondition', 'terrain', 'onHitField')
SPINNING_RE = re.compile(r'roll|spin|twirl|somersault|whirl|cyclone|tumble|wheel|rotor|gyro|drill')
SLICING_RE = re.compile(r'slash|cut|blade|sever|scythe|razor|shear|saw|slice|claw|fang|edge|beak|peck')


def synergy_match(kind, mid, fields, raw, weight_moves):
    """Does this move give an ability with `kind` something to work with?"""
    flags = str(fields.get('flags', ''))
    if kind.startswith('type:'):
        return raw['type'] == kind[5:] and raw['category'] != 'Status'
    if kind.startswith('category:'):
        return raw['category'] == kind[9:]
    if kind.startswith('flag:'):
        name = kind[5:]
        if name == 'slicing':
            return f'{name}: 1' in flags or bool(SLICING_RE.search(mid))
        return f'{name}: 1' in flags
    if kind == 'weight':
        return mid in weight_moves
    if kind == 'field':
        return any(key in fields for key in FIELD_KEYS)
    if kind == 'priority':
        return int(fields.get('priority', 0) or 0) > 0
    if kind == 'recoil':
        return 'recoil' in fields
    if kind == 'multihit':
        return 'multihit' in fields
    if kind == 'protect':
        return 'stallingMove' in fields
    if kind == 'spinning':
        return bool(SPINNING_RE.search(mid))
    if kind == 'lowbp':
        return raw['category'] != 'Status' and 0 < (raw['basePower'] or 0) <= 60
    if kind == 'paralyze':
        blob = ''.join(str(fields.get(key, '')) for key in ('status', 'secondary', 'secondaries'))
        return "'par'" in blob
    raise SystemExit(f'ABILITY_SYNERGY uses an unknown kind: {kind}')


def build_learnsets(species, generic, signatures, weight_moves=()):
    """generic: list of (id, entry-dict, raw-move); signatures: {family_page: [ids]}"""
    weight_moves = set(weight_moves)
    by_type = {}
    for mid, fields, raw in generic:
        by_type.setdefault(raw['type'], []).append((mid, raw))
    for lst in by_type.values():
        lst.sort(key=lambda x: x[0])

    learnsets = {}
    for sp in species:
        if sp.get('isMega'):
            continue  # battle-only formes inherit their base forme's learnset
        stats = sp['baseStats']
        physical = stats['atk'] >= stats['spa']
        bulky = (stats['def'] + stats['spd']) > (stats['atk'] + stats['spa'])
        moves = {}

        def add(mid, source='9L1'):
            moves.setdefault(mid, []).append(source)

        # 1. the line's own signature moves - always learned
        for mid in signatures.get(id(sp['family']), []):
            add(mid, '9L1')

        # 2. STAB: several damaging moves of each of the species' own types
        for t in sp['types']:
            pool = [(mid, raw) for mid, raw in by_type.get(t, [])
                    if raw['category'] != 'Status']
            wanted = [x for x in pool
                      if (x[1]['category'] == 'Physical') == physical]
            wanted = wanted or pool
            wanted.sort(key=lambda x: (-seeded(sp['name'], x[0]), x[0]))
            for mid, raw in wanted[:9]:
                add(mid, '9L1')
            # a couple of off-category STAB options so mixed sets are possible
            other = [x for x in pool if x not in wanted]
            other.sort(key=lambda x: (-seeded(sp['name'], 'off', x[0]), x[0]))
            for mid, raw in other[:3]:
                add(mid, '9M')

        # 3. Normal-type moves are universal filler, like the real games
        normals = [(mid, raw) for mid, raw in by_type.get('Normal', [])]
        normals.sort(key=lambda x: (-seeded(sp['name'], 'normal', x[0]), x[0]))
        for mid, raw in normals[:8]:
            if raw['category'] == 'Status' or (raw['category'] == 'Physical') == physical:
                add(mid, '9M')

        # 4. coverage from two deterministic "TM" types
        coverage = [t for t in TYPES if t not in sp['types'] and t != 'Normal']
        coverage.sort(key=lambda t: -seeded(sp['name'], 'cover', t))
        for t in coverage[:3]:
            pool = [(mid, raw) for mid, raw in by_type.get(t, [])
                    if raw['category'] != 'Status' and
                    (raw['category'] == 'Physical') == physical]
            pool.sort(key=lambda x: (-seeded(sp['name'], 'cv', x[0]), x[0]))
            for mid, raw in pool[:3]:
                add(mid, '9M')

        # 5. support/status moves - bulkier species get more of them
        status_pool = []
        for t in sp['types'] + ['Normal']:
            status_pool += [(mid, raw) for mid, raw in by_type.get(t, [])
                            if raw['category'] == 'Status']
        status_pool.sort(key=lambda x: (-seeded(sp['name'], 'st', x[0]), x[0]))
        for mid, raw in status_pool[:(10 if bulky else 5)]:
            add(mid, '9M')

        # 6. ability synergy: whatever this Pokemon's own ability rewards
        for ability in sp['abilities'].values():
            for kind in ABILITY_SYNERGY.get(toID(ability), []):
                already = sum(1 for mid, fields, raw in generic
                              if mid in moves and
                              synergy_match(kind, mid, fields, raw, weight_moves))
                if already >= 3:
                    continue
                pool = [(mid, fields, raw) for mid, fields, raw in generic
                        if mid not in moves and
                        synergy_match(kind, mid, fields, raw, weight_moves)]
                # Prefer the species' own attacking side, then its own typing,
                # then a stable name-seeded order so the pick never wobbles.
                pool.sort(key=lambda x: (
                    0 if x[2]['category'] == 'Status' or
                    (x[2]['category'] == 'Physical') == physical else 1,
                    0 if x[2]['type'] in sp['types'] else 1,
                    -seeded(sp['name'], 'ability', x[0]), x[0],
                ))
                for mid, _fields, _raw in pool[:3 - already]:
                    add(mid, '9M')

        learnsets[toID(sp['name'])] = {'learnset': moves}
    return learnsets


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
HEADER = """/**
 * AUTO-GENERATED by tools/fakemon/build.py - do not edit by hand.
 * Regenerate with:  python3 tools/fakemon/build.py
 * Source of truth: the Fakemon dex PDF, the move-expansion PDF and the
 * custom move xlsx (see tools/fakemon/raw/).
 */

"""


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    families = json.load(open(os.path.join(here, 'raw', 'dex.json')))
    moves_raw = json.load(open(os.path.join(here, 'raw', 'moves.json')))
    os.makedirs(OUT, exist_ok=True)

    # ---- moves -----------------------------------------------------------
    seen = {}
    generic = []
    num = 1
    report = {'moves': 0, 'unmatchedEffects': [], 'partialEffects': []}
    weight_moves = []
    for source in ('pdf', 'xlsx'):
        for raw in moves_raw[source]:
            mid = toID(raw['name'])
            if mid in seen:
                continue  # the 12 names shared by both files: xlsx is 2nd, PDF wins
            seen[mid] = True
            fields, spec = build_move(num, raw, source)
            if spec.unmatched and raw.get('effect'):
                report['unmatchedEffects'].append(raw['name'])
            gaps = effect_text_gaps(raw)
            if len(gaps) >= 3 and raw['name'] not in COVERAGE_ALLOWLIST:
                report['partialEffects'].append(f"{raw['name']}: {' '.join(gaps[:10])}")
            if 'getWeight' in str(fields.get('basePowerCallback', '')):
                weight_moves.append(mid)
            generic.append((mid, fields, raw))
            num += 1
    report['moves'] = len(generic)

    body = '\n'.join(render_entry(mid, fields) for mid, fields, _ in generic)
    with open(os.path.join(OUT, 'moves-generic.ts'), 'w') as f:
        f.write(HEADER)
        f.write("export const GenericMoves: import('../../../../sim/dex-moves')"
                ".ModdedMoveDataTable = {\n")
        f.write(body)
        f.write('\n};\n')

    # ---- species ---------------------------------------------------------
    species = apply_species_fixups(build_species(families))
    lines = []
    for sp in species:
        lines.append(render_entry(toID(sp['name']), render_species(sp)))
    with open(os.path.join(OUT, 'pokedex.ts'), 'w') as f:
        f.write(HEADER)
        f.write("export const Pokedex: import('../../../../sim/dex-species')"
                ".ModdedSpeciesDataTable = {\n")
        f.write('\n'.join(lines))
        f.write('\n};\n')

    # ---- learnsets -------------------------------------------------------
    signatures = {}
    for fam in families:
        signatures[id(fam)] = [toID(m['name']) for m in fam['moves']]
    for sp in species:
        sp['family'] = next(f for f in families if f['page'] == sp['family']['page'])
    signatures = {id(f): [toID(m['name']) for m in f['moves']] for f in families}
    learnsets = build_learnsets(species, generic, signatures, weight_moves)
    lines = []
    for sid, data in learnsets.items():
        inner = '\n'.join(f'\t\t\t{mid}: {json.dumps(sources)},'.replace('"', "'")
                          for mid, sources in sorted(data['learnset'].items()))
        lines.append(f'\t{sid}: {{\n\t\tlearnset: {{\n{inner}\n\t\t}},\n\t}},')
    with open(os.path.join(OUT, 'learnsets.ts'), 'w') as f:
        f.write(HEADER)
        f.write("export const Learnsets: import('../../../../sim/dex-species')"
                ".ModdedLearnsetDataTable = {\n")
        f.write('\n'.join(lines))
        f.write('\n};\n')

    # ---- formats-data ----------------------------------------------------
    lines = []
    for sp in species:
        if sp.get('isMega'):
            tier = 'Illegal'
        elif sp['stage'] in ('basic', 'middle'):
            tier = 'NFE'
        else:
            tier = 'OU'
        lines.append(f"\t{toID(sp['name'])}: {{\n\t\ttier: '{tier}',\n"
                     f"\t\tdoublesTier: '{'DOU' if tier == 'OU' else tier}',\n\t}},")
    with open(os.path.join(OUT, 'formats-data.ts'), 'w') as f:
        f.write(HEADER)
        f.write("export const FormatsData: import('../../../../sim/dex-species')"
                ".ModdedSpeciesFormatsDataTable = {\n")
        f.write('\n'.join(lines))
        f.write('\n};\n')

    # ---- index used by the mod, the tests and the data check -------------
    sig_moves, sig_abilities, mega_abilities = {}, {}, {}
    for fam in families:
        for m in fam['moves']:
            sig_moves.setdefault(toID(m['name']), m['name'])
        for a in fam['abilities']:
            sig_abilities.setdefault(toID(a['name']), a['name'])
        for a in fam['megaAbilities']:
            mega_abilities.setdefault(toID(a['name']), a['name'])
    megas = {}
    for sp in species:
        if sp.get('isMega'):
            megas[toID(sp['baseSpecies'])] = {
                'stone': sp['requiredItemName'],
                'stoneId': toID(sp['requiredItemName']),
                'forme': sp['name'],
                'ability': sp['abilities']['0'],
            }
    index = {
        'species': [sp['name'] for sp in species],
        'baseSpecies': [sp['name'] for sp in species if not sp.get('isMega')],
        'genericMoves': sorted(seen),
        'signatureMoves': sig_moves,
        'abilities': sig_abilities,
        'megaAbilities': mega_abilities,
        'megas': megas,
        # Moves whose damage is calculated from body weight (Lightweight, Timber
        # Fall and Aerodynamic Heavyweight all key off this list).
        'weightMoves': sorted(set(weight_moves) | {
            'crustalram', 'stemdrop', 'baloonbounce', 'heavyslammer',
        }),
    }
    with open(os.path.join(OUT, 'index.ts'), 'w') as f:
        f.write(HEADER)
        f.write('/** Machine-readable inventory of everything this mod adds. */\n')
        f.write('export const FakemonIndex = ' + json.dumps(index, indent=1) + ' as const;\n')

    json.dump(index, open(os.path.join(here, 'raw', 'index.json'), 'w'), indent=1)
    print(f"species={len(species)} genericMoves={len(generic)} "
          f"signatureMoves={len(sig_moves)} abilities={len(sig_abilities)} "
          f"megaAbilities={len(mega_abilities)} megas={len(megas)} "
          f"learnsets={len(learnsets)}")
    if report['unmatchedEffects']:
        print('UNCOMPILED EFFECTS:', report['unmatchedEffects'])
    if report['partialEffects']:
        print('PARTIALLY COMPILED EFFECTS:')
        for line in report['partialEffects']:
            print('  -', line)


if __name__ == '__main__':
    main()
