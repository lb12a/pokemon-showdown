"""Draw a pixel-art icon for every item, chosen from its own name and effect."""
import json, os, random, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from pixel import Grid, Palette, INK, seed_of
import shapes

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))


def load_items():
    """The item list comes from the bundle `node build` writes for the client."""
    path = os.path.join(ROOT, 'server', 'static', 'data', 'fakemon-data.js')
    text = open(path, encoding='utf-8').read()
    bundle = json.loads(text[text.index('{'):text.rindex('}') + 1])
    return {i: {'name': v['name'], 'desc': v.get('desc', ''), 'group': v.get('group', '')}
            for i, v in bundle['items'].items()}


ITEMS = load_items()

# A word in the name picks the shape. First match wins, so the more specific
# words come first.
SHAPE_WORDS = [
    ('shroom', 'mushroom'), ('truffle', 'mushroom'), ('spongeshroom', 'mushroom'),
    ('donut', 'donut'), ('macaron', 'cookie'), ('biscuit', 'cookie'),
    ('cracker', 'cookie'), ('cookie', 'cookie'), ('crisp', 'cookie'),
    ('wafer', 'cookie'), ('bar', 'cookie'), ('crumb', 'cookie'),
    ('croissant', 'croissant'), ('knot', 'pretzel'), ('pretzel', 'pretzel'),
    ('twist', 'pretzel'), ('twister', 'pretzel'),
    ('loaf', 'loaf'), ('bread', 'loaf'), ('boule', 'loaf'), ('roll', 'loaf'),
    ('bun', 'loaf'), ('flatbread', 'loaf'), ('focaccia', 'loaf'), ('brioche', 'loaf'),
    ('melon', 'melon'),
    ('pastry', 'pastry'), ('pie', 'pastry'), ('pancake', 'pastry'), ('cake', 'pastry'),
    ('pasty', 'pastry'), ('wrap', 'pastry'), ('maki', 'pastry'),
    ('jelly', 'jelly'), ('ooze', 'jelly'), ('ganache', 'jelly'), ('marshmallow', 'jelly'),
    ('blob', 'jelly'), ('pudding', 'jelly'), ('honey-comb', 'jelly'), ('comb', 'jelly'),
    ('melon', 'melon'), ('pumpkin', 'melon'), ('apple', 'melon'), ('plum', 'melon'),
    ('pear', 'melon'), ('berry', 'berry'), ('raisin', 'berry'), ('grape', 'berry'),
    ('nut', 'nut'), ('acorn', 'nut'), ('walnut', 'nut'), ('chestnut', 'nut'),
    ('kernel', 'nut'), ('seedmix', 'nut'), ('seed', 'pod'), ('pea', 'pod'),
    ('pod', 'pod'), ('bulb', 'pod'), ('bud', 'pod'),
    ('chili', 'chili'), ('pepper', 'chili'), ('chew', 'chili'),
    ('carrot', 'root'), ('radish', 'root'), ('tendril', 'kelp'), ('stalk', 'kelp'),
    ('kelp', 'kelp'), ('sprout', 'kelp'), ('coral', 'kelp'), ('branch', 'kelp'),
    ('egg', 'egg'), ('jerky', 'jerky'), ('tallow', 'jerky'), ('meat', 'jerky'),
    ('candy', 'candy'), ('sweet-crush', 'candy'), ('shard-candy', 'candy'),
    ('donut', 'donut'), ('salt', 'candy'), ('sugar-shard', 'crystal'),
    ('chai', 'cup'), ('tea', 'cup'), ('brew', 'cup'), ('broth', 'cup'),
    ('soda', 'cup'), ('drink', 'cup'), ('pop', 'cup'), ('coffee', 'cup'),
    ('cold-brew', 'cup'),
    ('elixir', 'bottle'), ('tonic', 'bottle'), ('nectar', 'vial'), ('vial', 'vial'),
    ('extract', 'vial'), ('essence', 'vial'), ('distillate', 'vial'),
    ('blend', 'bottle'), ('oil', 'bottle'), ('flask', 'bottle'), ('serum', 'syringe'),
    ('injection', 'syringe'), ('drop', 'vial'),
    ('petal', 'leaf'), ('leaf', 'leaf'), ('bloom', 'leaf'), ('orchid', 'leaf'),
    ('flower', 'leaf'), ('grass', 'leaf'), ('tuft', 'feather'), ('moss', 'leaf'),
    ('zest', 'leaf'), ('peel', 'leaf'), ('herbal', 'leaf'), ('herb', 'leaf'),
    ('cactus', 'chili'), ('bramble', 'berry'), ('spore', 'mushroom'),

    ('chip', 'chip'), ('logic-board', 'chip'), ('board', 'chip'), ('circuit', 'chip'),
    ('drive', 'chip'), ('dongle', 'chip'), ('processor', 'chip'), ('analyzer', 'chip'),
    ('interface', 'chip'), ('transceiver', 'chip'), ('router', 'chip'),
    ('battery', 'battery'), ('capacitor', 'battery'), ('dynamo', 'battery'),
    ('cable', 'cable'), ('link-cable', 'cable'), ('wire', 'cable'), ('looper', 'cable'),
    ('key', 'key'), ('buckle', 'key'), ('valve', 'key'),
    ('goggles', 'goggles'), ('visor', 'goggles'),
    ('monocle', 'monocle'), ('lens', 'monocle'), ('prism', 'crystal'),
    ('monocular', 'scope'), ('scope', 'scope'), ('sight', 'scope'),
    ('core', 'orb'), ('orb', 'orb'), ('sphere', 'orb'), ('quantum', 'orb'),
    ('catalyst', 'orb'), ('pearl', 'orb'),
    ('crystal', 'crystal'), ('shard', 'crystal'), ('quartz', 'crystal'),
    ('resonator', 'crystal'), ('amber', 'gem'), ('gem', 'gem'), ('sap', 'gem'),
    ('resin', 'gem'), ('stone', 'plate'), ('slate', 'shield'), ('plating', 'shield'),
    ('shield', 'shield'), ('gorget', 'shield'), ('armor', 'shield'),
    ('vest', 'shield'), ('vestment', 'shield'), ('patch', 'shield'),
    ('ring', 'ring_item'), ('collar', 'ring_item'),
    ('boots', 'boots'), ('greaves', 'boots'), ('sabatons', 'boots'), ('glider', 'feather'),
    ('belt', 'belt'), ('harness', 'belt'), ('rig', 'belt'), ('sash', 'sash'),
    ('gauntlet', 'gauntlet'), ('gauntlets', 'gauntlet'), ('bracers', 'gauntlet'),
    ('pendant', 'pendant'), ('charm', 'pendant'), ('amulet', 'pendant'),
    ('bell', 'bell'), ('hourglass', 'hourglass'), ('dial', 'dial'), ('compass', 'dial'),
    ('grenade', 'canister'), ('canister', 'canister'), ('bomb', 'canister'),
    ('filter', 'canister'), ('suppressor', 'canister'), ('amplifier', 'panel'),
    ('booster', 'panel'), ('panel', 'panel'), ('solar-panel', 'panel'),
    ('coils', 'coil'), ('coil', 'coil'), ('spring', 'coil'), ('spring-coiled', 'coil'),
    ('fork', 'fork'), ('antenna', 'fork'),
    ('doll', 'doll'), ('puppet', 'doll'), ('marionette', 'doll'), ('voodoo', 'doll'),
    ('ribbon', 'ribbon'), ('string', 'ribbon'), ('handkerchief', 'ribbon'),
    ('weft', 'ribbon'), ('veil', 'ribbon'), ('loom', 'ribbon'),
    ('mirror', 'mirror'), ('glass', 'mirror'), ('anchor', 'anchor'),
    ('candle', 'candle'), ('incense', 'incense'), ('burner', 'incense'),
    ('fossil', 'fossil'), ('chitin', 'fossil'), ('cocoon', 'fossil'),
    ('crust', 'fossil'), ('husk', 'fossil'), ('bark', 'fossil'), ('shell', 'fossil'),
    ('spike', 'spike'), ('spur', 'spike'), ('pin', 'spike'), ('tooth', 'spike'),
    ('pouch', 'pouch'), ('powder', 'pouch'), ('bag', 'pouch'), ('clump', 'pouch'),
    ('mud', 'pouch'), ('ash', 'pouch'), ('sulfur', 'pouch'), ('bedding', 'pouch'),
    ('feather', 'feather'), ('wing', 'feather'), ('plume', 'feather'),
    ('weight', 'weight'), ('weights', 'weight'), ('weighted', 'weight'),
    ('heatsink', 'panel'), ('lodestone', 'plate'), ('magnetite', 'plate'),
    ('seal', 'plate'), ('inscription', 'plate'), ('band', 'band'),
    ('plate', 'plate'), ('rock', 'plate'), ('cone', 'crystal'), ('ore', 'plate'),
    ('sulfur', 'pouch'), ('eye', 'orb'), ('doll-eye', 'doll'), ('cluster', 'berry'),
    ('tuning', 'fork'), ('heatsink', 'panel'), ('vestment', 'shield'),
    ('gorget', 'shield'), ('under-armor', 'shield'), ('bracers', 'gauntlet'),
    ('float-stone', 'orb'), ('pumice', 'orb'), ('ground', 'plate'),
]

# A word in the name picks the colour. First match wins.
HUE_WORDS = [
    (('volcanic', 'magma', 'cinder', 'searing', 'thermal', 'char', 'flame', 'fire',
      'ember', 'heat', 'burn', 'lava'), 0.035, 0.78),
    (('frost', 'glacial', 'ice', 'icy', 'chill', 'snow', 'cold', 'freeze'), 0.53, 0.55),
    (('volt', 'static', 'shock', 'electric', 'elec', 'charge', 'surge', 'induction',
      'capacitor', 'dynamo', 'battery', 'overclock', 'spark'), 0.14, 0.85),
    (('toxic', 'poison', 'venom', 'malware', 'purge', 'sour', 'acid'), 0.79, 0.50),
    (('ghost', 'haunted', 'spirit', 'spooky', 'phantom', 'soul', 'cursed', 'voodoo',
      'hexing', 'ethereal', 'wraith'), 0.72, 0.35),
    (('dark', 'midnight', 'twilight', 'shadow', 'night', 'encrypt', 'proxy',
      'code-breaker', 'executioner'), 0.66, 0.32),
    (('grass', 'leaf', 'herb', 'bloom', 'sprout', 'oak', 'moss', 'vine', 'seed',
      'petal', 'flower', 'orchid', 'bramble', 'forest', 'wood'), 0.29, 0.50),
    (('aqua', 'aquatic', 'water', 'sea', 'brine', 'briny', 'dew', 'tide', 'ocean',
      'bog', 'marine', 'coral', 'kelp', 'hydro', 'misty', 'rain'), 0.55, 0.55),
    (('mud', 'clay', 'earth', 'sand', 'arid', 'soil', 'dirt', 'bedding'), 0.08, 0.42),
    (('rock', 'stone', 'granite', 'slate', 'boulder', 'pebble', 'petrified',
      'pumice', 'chalk', 'quarry'), 0.09, 0.16),
    (('iron', 'steel', 'metal', 'plated', 'plating', 'chrome', 'alloy', 'magnet',
      'magnetic', 'magnetite', 'lodestone', 'gorget', 'sabatons'), 0.58, 0.14),
    (('psychic', 'quantum', 'astral', 'mind', 'kaleido', 'aura', 'heuristic',
      'resonance', 'echo'), 0.85, 0.55),
    (('fae', 'fairy', 'sweet', 'sugar', 'candy', 'honey', 'caramel', 'glazed',
      'marshmallow', 'pink'), 0.92, 0.62),
    (('dragon', 'drake', 'wyrm'), 0.70, 0.60),
    (('assault', 'bladed', 'fight', 'punch', 'rage', 'adrenaline', 'combat',
      'brawl'), 0.98, 0.60),
    (('feather', 'glider', 'sky', 'wind', 'air', 'flight', 'aerial', 'clear-sky'), 0.52, 0.35),
    (('bug', 'cricket', 'chitin', 'cocoon', 'insect', 'larva'), 0.22, 0.55),
    (('lunar', 'moon', 'full-moon', 'full moon'), 0.62, 0.30),
    (('solar', 'sun', 'golden', 'gold', 'amber'), 0.11, 0.70),
    (('glitch', 'glitched', 'data', 'digital', 'buffer', 'ddos', 'signal',
      'feedback', 'logic', 'circuit'), 0.44, 0.62),
]

FALLBACK_SHAPE = {
    'Core': ['berry', 'band', 'plate', 'orb'],
    'Food': ['berry', 'loaf', 'nut', 'cookie'],
    'Consumable': ['bottle', 'vial', 'cup', 'pod'],
    'Battle gear': ['orb', 'chip', 'gem', 'pendant', 'canister'],
    'Permanent gear': ['plate', 'shield', 'crystal', 'coil', 'chip'],
    'Mega Stone': ['megastone'],
}


WORD = re.compile(r"[a-z]+")


def matches(tokens, whole, key):
    """
    Word-aware matching. A plain substring test reads "Induction Coils" as oil
    and "Spring-Loaded" as a ring, so a key has to line up with a real word -
    or be a long enough tail of one, which is how "Spongeshroom" is a shroom.
    """
    if ' ' in key or '-' in key:
        return key in whole
    for token in tokens:
        if token == key or token == key + 's' or token + 's' == key:
            return True
        if token.endswith(key) and len(token) - len(key) >= 4:
            return True
    return False


def pick(words, table, default):
    whole = words.lower()
    tokens = WORD.findall(whole)
    for key, value in table:
        if matches(tokens, whole, key):
            return value
    return default


def hue_for(name, desc, seed):
    text = f'{name} {desc}'.lower()
    for keys, hue, sat in HUE_WORDS:
        if any(k in text for k in keys):
            return hue, sat
    # Nothing thematic: spread the rest evenly around the wheel so two items
    # sitting next to each other in the bag never look identical.
    return (seed % 360) / 360.0, 0.5


def draw(item_id, item, out_dir, scale=2):
    name, desc, group = item['name'], item['desc'], item['group']
    seed = seed_of(item_id)
    rnd = random.Random(seed)

    if group == 'Mega Stone':
        shape = 'megastone'
    else:
        options = FALLBACK_SHAPE.get(group, ['orb'])
        shape = pick(name, SHAPE_WORDS, options[seed % len(options)])

    hue, sat = hue_for(name, desc, seed)
    # A little jitter keeps same-themed items visually distinct.
    palette = Palette(hue, sat, jitter=((seed >> 8) % 21 - 10) / 260.0)

    grid = Grid(32)
    getattr(shapes, shape)(grid, palette, rnd)
    grid.outline(INK)
    grid.to_image(scale, Image).save(os.path.join(out_dir, f'{item_id}.png'), optimize=True)
    return shape


def main():
    items_dir = os.path.join(ROOT, 'assets', 'items')
    mega_dir = os.path.join(ROOT, 'assets', 'mega')
    os.makedirs(items_dir, exist_ok=True)
    os.makedirs(mega_dir, exist_ok=True)

    used = {}
    for item_id, item in sorted(ITEMS.items()):
        shape = draw(item_id, item, items_dir)
        used.setdefault(shape, []).append(item['name'])
        if item['group'] == 'Mega Stone':
            draw(item_id, item, mega_dir)

    print(f'drew {len(ITEMS)} item icons using {len(used)} shapes')
    for shape, names in sorted(used.items(), key=lambda kv: -len(kv[1])):
        print(f'  {shape:12} {len(names):3}  e.g. {", ".join(names[:3])}')


if __name__ == '__main__':
    main()
