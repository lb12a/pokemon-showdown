# Fakemon — Implementation Notes

This repository is no longer a normal Pokémon Showdown server. It runs a custom
Pokémon system built entirely from the supplied source files. The original
Showdown data is not available to players in any way.

**Sources of truth**

| File | What it provides |
| --- | --- |
| `FakemonFinishedDex.pdf` (96 pages) | 158 Pokémon + 20 Mega formes, 171 signature moves, 166 abilities, 20 Mega abilities |
| `DOC-20260902-WA0010.pdf` ("Massive Erweiterung") | 390 moves (50 Normal + 20 per type) |
| `pokemon_custom_moves_340_damage_model.xlsx` | 340 further moves, fully structured, plus the damage model |

---

## 1. What is in the game now

```
158 Pokémon (178 dex entries, including 20 Mega formes)
884 moves    (171 of them signature moves from the dex PDF)
186 abilities (166 normal + 20 Mega abilities)
40 items     (20 Mega Stones + 10 food items + 10 utility items)
```

`node tools/fakemon/check.js` prints this report and validates the whole dex.
It currently reports **0 errors**; the only warnings are "no sprite yet", one per
Pokémon, because the artwork is still placeholders.

## 2. How the PDF colours were read

The dex PDF's own legend (page 1) defines the colour code, and it is what the
importer keys on. It was also verified visually by rendering pages 15, 32 and 45.

| Colour | Meaning | Implemented as |
| --- | --- | --- |
| `#252525` dark | `Name>Types` header | a species entry |
| `#FFCB30` yellow | guaranteed-learned & signature moves | a move, always in that line's learnset |
| `#2FEBD2` cyan | possible abilities of the evolution line | a normal ability |
| `#3396FF` blue | **ability of the Mega form** | a Mega ability, reachable only by Mega Evolving |

The distinction the spec stresses is enforced twice over: a Mega ability appears
on no base forme (checked by `tools/fakemon/check.js` and by a unit test), and
the team validator rejects a Mega ability picked directly in the Teambuilder.

## 3. Separation from original Showdown data

`data/mods/fakemon/scripts.ts` → `init()` deletes, from this mod's tables:

* **every** original species, learnset and formats-data entry
* **every** original ability and item
* every original move except a whitelist of ~70 that the engine reaches for as
  *mechanics* — Showdown implements terrains, screens, hazards, Protect and many
  volatiles as conditions hanging off a move. Those survive but are flagged
  `isNonstandard: 'Custom'` and appear in no learnset, so they can never be
  picked, imported, or used.

It also installs a **filtered alias table**. This mattered: lookups resolve
aliases before the data tables, so the inherited alias `adapt → adaptability`
was hiding the custom move `Adapt`. Four moves were affected (`Adapt`,
`Resonance`, `Sand Blast`, `Vine Lash`, plus the signature move `Meltdown`).
Fixing it needed one three-line change in `sim/dex.ts` so a mod may install its
own alias map; the base dex is unaffected.

Enforcement is server-side and independent of the client:

* `Fakemon Standard` (`data/mods/fakemon/rulesets.ts`) re-checks every species,
  move, ability and item of every set against the generated inventory and gives
  a plain-language error.
* `Obtainable Moves` enforces the learnsets, so even a legal-looking custom move
  is rejected on a Pokémon that cannot learn it.

## 4. Mega Evolution

Rebuilt in `data/mods/fakemon/scripts.ts` (`actions.canMegaEvo` / `runMegaEvo`).

**Every Pokémon can Mega Evolve, once per side per battle.**

* **Without a matching stone** — the Pokémon *stays the same species* (as the
  spec requires) and gains **+20 to all six base stats (+120 BST)**. This is done
  by installing a cloned species with raised stats, then `updateMaxHp()`; the
  ability does not change. Holding another Pokémon's stone does not block this —
  the stone simply does nothing.
* **With its own Mega Stone** — a normal forme change into the `-Mega` species,
  which is worth **exactly +100 BST** and carries the **Mega ability**. The
  +100 never touches HP, so the HP bar cannot desync mid-battle.

Both paths, the +20/+100 totals, the ability switch and the once-per-battle rule
are covered by tests in `test/sim/fakemon/system.js`.

## 5. New battle effects

`data/mods/fakemon/conditions.ts` adds real, turn-persistent effects:

* **Weather** — Full Moon (Ghost moves ×1.5, Ghost stats cannot be lowered),
  Miasma
* **Rooms / fields** — Haunted Room (every non-Ghost also counts as Ghost),
  Glitched Room (all type immunities lifted), Priority Lock, Weather Lock, Ant
  Swarm, Electrified Ground, Ability Lock, EMP Field
* **Side conditions** — Gasveil (foes take double Fire damage), Cotton Field,
  Live Wire (paralysing hazard that Electric/Ground types remove), Bleed Hazard,
  Speed/Healing relays, Ground Ward, Thermal Draft, Special Mirror
* **Volatiles** — ~25 more, including the Mega marker, the consecutive-use
  counter, braces, contact-punish coats, bleed and scorch effects

## 6. Bot

`data/mods/fakemon/bot.ts` is a heuristic AI that sees exactly what a player
sees (the request plus the public log). It estimates the damage of every legal
move with the real type chart, spots KOs, respects immunities, uses Protect
sensibly (never twice in a row), switches out of bad matchups, values status and
setup by how healthy it is, picks targets in doubles, prefers spread moves that
hit two Pokémon, and Mega Evolves. Three difficulties (`easy`, `normal`, `hard`)
vary the noise added to each score and whether it switches or Megas at all.

`server/room-battle.ts` gained a small generic `BattleBot` interface so a battle
slot can be played by an AI instead of a user; the AI answers each request and
recovers from a rejected choice, so a bot can never stall a battle.

### Commands

```
/fakemonbot [format], [bot name], [team mode], [difficulty]
```

* `format` — `singles` (default), `doubles`, `random`, `randomdoubles`
* `team mode` — `random` (the bot builds its own team), `mirror` (the bot copies
  your team), `swap` (**the bot uses the team you built and you get a random
  one** — this is the "build a team for the bot and play against it" mode)
* `difficulty` — `easy`, `normal` (default), `hard`

```
/fakemonchallenge [username], [format]   invite a friend (uses Showdown's own
                                         challenge system and private battle room)
/fakemondex [name]                       look up any Pokémon/move/ability/item
/fakemonreport                           the implementation summary
```

Player-vs-player needed no new code: the six Fakemon formats are ordinary
formats, so challenges, the private battle link and the ladder all work.

## 7. Decisions I made where the sources were silent

Everything below was invented because no source file specifies it. All of it is
derived deterministically, so regenerating never reshuffles the dex.

| Missing | Decision |
| --- | --- |
| **Base stats** | Derived per species in `tools/fakemon/build.py`. BST by evolution stage (basic 320, middle 420, final 520, single-stage 500). HP takes a reserved 14–20 % share; the rest is split by weighting each stat against keywords in that line's *own* move/ability text (a line that talks about Sp. Atk gets Sp. Atk) plus its typing, with a name-seeded jitter so members of a line are not clones. |
| **Mega +100 split** | Pushed into the forme's strongest stats in a 40/25/15/12/8 pattern, rotated per species. Never into HP. Always exactly +100. |
| **Move PP** | From power: ≤45 → 30, ≤65 → 25, ≤80 → 15, ≤100 → 10, else 5. Status moves 10 if they set weather/field/screens/status, else 20. |
| **Contact / sound / punch / bite / bullet / powder flags** | Inferred from the move's name and category (`punch`, `beam`, `pulse`, `bomb`, `spore`, …). |
| **Signature move power & accuracy** | Chosen to match the described effect's strength — a move with a strong effect gets less power. E.g. Fiendish Bargain costs 50 % HP for +2/+2; Heavenly Smite is 150 BP but the user faints on a miss. |
| **Learnsets** | The line's own signature moves are always learned (the PDF's yellow legend says so). The rest is role-aware: ~9 STAB moves of the right category per type, a few off-category ones, Normal-type filler, three deterministic coverage types, and 5–10 status moves (more for bulky Pokémon). |
| **Items** | The dex PDF refers to "food items" repeatedly but never lists any, so 10 were defined (`FOOD_ITEMS` in `data/mods/fakemon/items.ts` is the single list every ability checks). 10 neutral utility items were added so team building has choices. |
| **Tiers** | Final stages `OU`, earlier stages `NFE`, Mega formes `Illegal` (they are battle-only). |
| **Bot strategy** | Entirely mine; see section 6. |

## 8. Conflicts between the sources, and how they were resolved

1. **Two separate move libraries.** The expansion PDF (390 moves) and the xlsx
   (340 moves) share only 12 names and are otherwise different sets. Both were
   imported in full; where a name appears in both, the PDF version wins because
   it is the more recent document.
2. **Four names are both generic and signature moves** — `Copycat Strike`,
   `Flutter Strike`, `Live Wire`, `Short Circuit`. The hand-written signature
   version wins, because the dex PDF describes them in more detail. Total unique
   moves: 884, not 888.
3. **The xlsx type chart is all 1.0.** That is an unfilled template, not a design
   decision — a game where nothing is super effective contradicts the rest of the
   xlsx (which has "super effective against Steel" moves) and the dex PDF. The
   standard type chart is kept.
4. **Garbled species headers.** The PDF's text layer glues some lines together
   (pages 15, 32, 45). Those pages were rendered and read visually; the
   corrections live in `HEADER_FIXUPS` in `tools/fakemon/parse_dex.py`.
5. **`Tigitz` and its evolutions have no types in the PDF** (the entry is marked
   as work in progress). Normal/Fighting and Normal/Fairy were used, from the
   line's own `Furious Fang` description ("Fairy if Female, Fighting if Male").
6. **`Metafly/Formen>Käfer+[Elektro,Fee,Feuer,Eis,Gift]`** was expanded into five
   formes: Metafly (Bug/Electric), Metafly-Fairy, -Fire, -Ice, -Poison.

## 9. The built-in web client

Opening the server used to redirect the browser to `play.pokemonshowdown.com`,
which ships its own dex - that is why the Teambuilder still showed the original
Pokemon. The server now serves **its own client** from `server/static/`, so
`http://localhost:8000` is the custom game and nothing else.

* `index.html` / `fakemon.css` / `fakemon.js` - a dependency-free client that
  speaks the normal Showdown protocol over the server's own SockJS endpoint.
* `server/static/data/fakemon-data.js` - the dex the client uses. `node build`
  regenerates it from `data/mods/fakemon/`, so the client can never drift out of
  sync, and it contains **no original data at all** (a test asserts this).
* `/assets/…` is served from `assets/`, and a missing image falls back to
  `placeholder.png`, so the UI never shows a broken picture.

What it does:

* **Teambuilder** - only custom Pokemon, moves, abilities, items and Mega
  Stones. Teams are saved in the browser, and can be edited, duplicated and
  deleted. A new player starts with a generated, legal team so they can press
  "Start battle" immediately. Illegal sets are called out before you battle.
* **Mega display** (spec 13) - every slot says what Mega Evolution will do:
  with its own stone, the resulting forme, its stats and its Mega Ability;
  without one, "+20 to every base stat". In battle the Mega button spells out
  the same thing and shows when it has been used up.
* **Battle UI** - move buttons with type, power and PP, a switch grid, HP bars,
  status and type badges, a MEGA badge, and a battle log. In doubles it collects
  one choice per active Pokemon and lets you click an opposing Pokemon to target
  it; spread moves skip the target step.
* **Play menu** - name the bot, pick the format, difficulty and whose team the
  bot uses; or challenge a friend by name and accept their challenge.
* **Dex** - search every Pokemon, move, ability and item in the game.

### Bugs found and fixed while testing this

1. `/fakemonbot` crashed with `User not found on … battle creation`: a battle
   slot without a user was not something `RoomBattle` supported. It now takes a
   `bots` option, fills those slots itself and treats them as present.
2. Four custom moves were unreachable because an inherited alias resolved first
   (`adapt` -> `adaptability`); the mod now installs a filtered alias table.
3. The client sent teams with no EVs, which the validator rejects. Sets now
   carry a real spread, pickable in the Teambuilder (auto / physical / special /
   fast / bulky).
4. In doubles the client only chose for the first Pokemon. It now collects a
   choice per slot, passes for fainted or empty slots, and passes when there is
   nothing left to switch to.
5. Challenges never appeared: this server build delivers them as PMs, not as
   `updatechallenges`. Both are handled now.

Verified in a real browser (Chromium): singles, doubles and player-vs-player all
play from the first click to a winner with zero JavaScript errors.

## 9a. Known limitations

* **Sprites are placeholders.** Every Pokemon renders as the placeholder until
  you drop real art into `assets/`. See `assets/README.md`.
* **The official Showdown client** can still connect to this server, and its own
  Teambuilder will show original Pokemon. It cannot get them into a battle - the
  server rejects such teams - but for the intended experience use the built-in
  client at `http://localhost:8000`. `node tools/fakemon/export-client.js` also
  writes drop-in data files for the separate `pokemon-showdown-client` repo if
  you would rather use that.
* **Three types.** Thirteen Pokemon have three types, exactly as the PDF
  specifies. The engine handles it; the client shows all three.
* **Team preview** picks the default order; there is no drag-to-reorder yet.
* **Balance is a first pass.** The data check flags no broken combinations, but
  884 moves have not been playtested against each other.

## 10. Files changed and added

**New**

```
data/mods/fakemon/            the whole custom game
  scripts.ts                  data purge + Mega Evolution
  pokedex.ts moves.ts learnsets.ts formats-data.ts   (wrappers)
  moves-signature.ts          171 hand-implemented signature moves
  abilities.ts                186 hand-implemented abilities
  items.ts                    40 items incl. Mega Stones
  conditions.ts               new weather, rooms, fields, volatiles
  rulesets.ts                 Fakemon Standard + mechanics bookkeeping
  bot.ts                      the AI
  assets.ts                   central image paths
  generated/                  produced by tools/fakemon/build.py
data/random-battles/fakemon/teams.ts   role-aware random teams
server/chat-plugins/fakemon.ts         /fakemonbot, /fakemonchallenge, …
server/static/index.html               the built-in web client
server/static/fakemon.css              its styling
server/static/fakemon.js               teambuilder, play menu and battle UI
config/custom-formats.ts               the six Fakemon formats
test/sim/fakemon/system.js             the test suite
tools/fakemon/                         importers, generator, check, exporter
assets/                                placeholder art + manifest
DATA_GUIDE.md                          how to add your own content
```

**Modified** (small, contained changes)

```
sim/dex.ts             let a mod install its own alias table (3 lines)
server/room-battle.ts  generic BattleBot interface, and a `bots` battle option
                       so a battle slot can be played by an AI
server/sockets.ts      serve assets/ , with a placeholder fallback
build                  regenerate the client's dex after compiling
eslint.config.mjs      ignore generated data and dist-client
test/sim/data.js       exempt the fakemon mod from the "no imports" rule,
                       like gen9ssb, because its data is modular on purpose
.gitignore             allow config/custom-formats.ts, ignore dist-client
```

## 11. Verifying it

```bash
node build                       # compile
node tools/fakemon/check.js      # data + balance report (0 errors)
npx mocha test/sim/fakemon/system.js   # the suite (runs everything: 2399 tests)
npx eslint                       # clean
npx tsc --noEmit                 # clean
node tools/fakemon/export-client.js    # client data for the Teambuilder
```

Then start the server and open **http://localhost:8000** in a browser - that is
the custom client, no external site involved.

The chat commands still work if you prefer typing:

```
/fakemonbot singles, ShadowMaster, random, hard
/fakemonbot doubles, TestDummy, swap, normal
/fakemonchallenge <friend>, doubles
/fakemondex Hallowisp
```
