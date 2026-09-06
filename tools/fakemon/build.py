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
    # "Ignores effects of the target's weight-based moves" is a self buff
    'floodrush': "'self'",
}


def resolve_target(move, spec):
    """The target a move really needs, not the one the generic rule guesses."""
    move_id = toID(move['name'])
    if move_id in TARGET_FIXUPS:
        return TARGET_FIXUPS[move_id]
    if spec.fields.get('target'):
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
    spec.fields['target'] = resolve_target(move, spec)
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


def render_species(entry):
    fields = {}
    fields['num'] = entry['num']
    fields['name'] = json.dumps(entry['name'])
    fields['types'] = json.dumps(entry['types'])
    if entry.get('baseSpecies'):
        fields['baseSpecies'] = json.dumps(entry['baseSpecies'])
        fields['forme'] = json.dumps(entry['forme'])
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


def build_learnsets(species, generic, signatures):
    """generic: list of (id, entry-dict, raw-move); signatures: {family_page: [ids]}"""
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
    species = build_species(families)
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
    learnsets = build_learnsets(species, generic, signatures)
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
