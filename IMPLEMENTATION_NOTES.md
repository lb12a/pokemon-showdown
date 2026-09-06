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
| `Pokemon_Food_Items.xlsx` | 50 held food items |
| `New_Unique_Consumable_Items.xlsx` | 50 single-use consumables |
| `Non_Food_Battle_Items.xlsx` | 50 battle items |
| `Final_Permanent_Held_Items.xlsx` | 50 permanent held items |

---

## 1. What is in the game now

```
158 Pokémon  (178 dex entries, including 20 Mega formes)
884 moves     (171 of them signature moves from the dex PDF)
186 abilities (166 normal + 20 Mega abilities)
240 items     (20 Mega Stones + 20 core items + the four item spreadsheets)
                50 food items        (Pokemon_Food_Items)
                50 consumables       (New_Unique_Consumable_Items)
                50 battle items      (Non_Food_Battle_Items)
                50 permanent items   (Final_Permanent_Held_Items)
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

A Pokémon that *has* its own Mega forme still only reaches it while it is
actually holding its own stone. Without the stone it takes the ordinary route
like everybody else: +20 to all six stats, same species, same ability, same
typing — it never turns into the `-Mega` forme. Holding somebody else's stone is
the same as holding none.

Both paths, the +20/+100 totals, the "has a Mega forme but no stone" case, the
ability switch and the once-per-battle rule are covered by tests in
`test/sim/fakemon/system.js`.

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

## 5a. Items

`data/mods/fakemon/items.ts` is the index; the four spreadsheets each get their
own module so a file can be re-imported on its own:

| file | source spreadsheet | count |
| --- | --- | --- |
| `items-food.ts` | `Pokemon_Food_Items` | 50 |
| `items-consumables.ts` | `New_Unique_Consumable_Items` | 50 |
| `items-battle.ts` | `Non_Food_Battle_Items` | 50 |
| `items-permanent.ts` | `Final_Permanent_Held_Items` | 50 |

`item-helpers.ts` holds the shared vocabulary the spreadsheets keep using —
"rolling", "cutting", "kicking", "pulse", "weight-based" moves, and the
"extend this effect by N turns, once" helper — so every item that mentions the
same concept behaves identically.

Every item is a real battle effect, never a description: food and consumables
are eaten with `eatItem` (so Nibble, Evergreen Cud, Itemfinder, Sugar Rush and
Nectar Dash all see them — `FOOD_ITEMS` is now built from the two edible tables
automatically), battle and permanent gear hook the damage, accuracy, priority,
status and field events.

Seven items needed new conditions, which live in `conditions.ts` §5:
`fakemonitemabilitylock` (Malware-Bait Truffle, drives Gastro Acid for 3 turns),
`fakemonitemlock` (EMP Grenade, keeps Embargo topped up), `fakemonpriorityrush`
(Adrenaline Cold-Brew), `fakemonflinchguard` (Peppermint Crunch-Bar),
`fakemonheavyload` (Sweet Potato-Pie), `fakemonsecondaryward` (Sun-Baked
Kernel), `fakemongroundguard` (Feather-Grass Tuft), `fakemonhazardward`
(Encryption Key / Spring-Loaded Boots) and the `fakemonwelcomeheal` side
condition (Cinnamon Roll-Knot).

Where a spreadsheet line described something the engine has no primitive for,
the closest real mechanic was used and the choice is written in the item's
`desc`:

* **Quantum Core** — "reverses turn priority inside a Room for the holder". The
  engine applies Trick Room globally in `getActionSpeed`, with no per-Pokémon
  exemption, so the holder instead moves first inside its priority bracket while
  a Room is up.
* **Twilight Hourglass** — weather and terrain set while the holder is out last
  one turn longer (once per instance); Rooms are extended when it switches in.
* **Proxy-Router Core** — bounces one reflectable status move at a random foe,
  the same mechanic Magic Coat uses.
* **Counter-Weight Weights** — the engine has no weight-tier comparison to
  reverse, so weight-based moves hit 25% harder from the holder and 25% softer
  at it.
* **Briny Kelp-Wrap** — "switches out via a move" is not distinguishable from a
  manual switch at the point the heal has to happen, so it heals on any
  switch-out.

The team builder groups the item picker by these families (`<optgroup>`), so the
240-item list stays readable; the grouping comes from the client data bundle,
which `tools/fakemon/export-client.js` tags per source file.

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

## 9b. The calculation audit

After the items went in, everything was checked for effects that *look*
implemented but never actually run. Two harnesses did the work:

* a **coverage harness** that wraps every ability/item/move handler, then builds
  a battle designed to trigger each one and reports the ones that never fire;
* an **effect-text coverage report** in `tools/fakemon/build.py`, which measures
  how much of each written effect the compiler rules actually consumed. A
  sentence like *"Eliminates all Terrains, paralyzes all grounded targets"* used
  to compile its first half and silently drop the second.

What it found and what was fixed:

| problem | effect | fix |
| --- | --- | --- |
| 30 status moves targeted `'self'` although their text names the opponent (Blank Stare, Rust, Enchantment, Fossilize, Mind Read, Deception, Contaminate, Quicksand, Web Trap, …) | the move resolved against its own user, so disabling, trapping, type changes and ability swaps hit the wrong Pokémon or did nothing | `resolve_target()` + `TARGET_FIXUPS` in `build.py`; self-boosts move into `self: { boosts }` when the target changes |
| 3 force-switch moves (Reset Roar, Warrior's Roar, Fear Monger) targeted `'self'` | they switched *the user* out | structural rule: `forceSwitch` ⇒ `target: 'normal'` |
| Grid Overload's `onHitField` with `target: 'self'` | the move did nothing at all | structural rule: `onHitField` ⇒ `target: 'all'`, plus the missing paralysis clause |
| 3 status moves used `onAfterHit` | `onAfterHit` only runs for moves that dealt damage, so it was dead code | `build.py` rewrites it to `onHit` on status moves |
| `needlejabready` and `barbedcounterhit` were deleted by the data purge | Needle Jab never retaliated and Barbed Counter never hit back | the purge now keeps moves tagged `isNonstandard: 'Custom'` |
| Needle Jab's `needlejabused` marker was never cleared | it retaliated once per *battle* instead of once per turn | the ready state removes the marker when it ends |
| Antenna Pulse read `move` from its own `onModifyPriority` | crash: a move's own priority event is fired by `singleEvent`, which passes no move | look the move up instead |
| Equalize wrote one `-sethp` line for two Pokémon | crash: "Multiple sides passed to add" | two protocol lines, like Pain Split |
| ~20 moves had a second clause nobody compiled (Freeze Dry Burst's Water weakness, Iron Drill's boost-ignoring, Dragon's Blood's stat drop, Sap Drain's boost theft, Rust's type removal, Deep Breath's priority, Ice Slick's hazard, Aero Shield's ¼ special damage, …) | half-implemented moves | 24 new rules in `effects.py` and 8 new conditions |

The coverage harness now fires a handler for **every** ability, item and move
except `Electic Gnaw`, which needs the target to be holding a food item, and it
runs 240 items × 3 seeds × 14 turns with zero crashes.

## 10. Files changed and added

**New**

```
data/mods/fakemon/            the whole custom game
  scripts.ts                  data purge + Mega Evolution
  pokedex.ts moves.ts learnsets.ts formats-data.ts   (wrappers)
  moves-signature.ts          171 hand-implemented signature moves
  abilities.ts                186 hand-implemented abilities
  items.ts                    index: Mega Stones, core food, utility items
  items-food.ts               50 food items      (Pokemon_Food_Items)
  items-consumables.ts        50 consumables     (New_Unique_Consumable_Items)
  items-battle.ts             50 battle items    (Non_Food_Battle_Items)
  items-permanent.ts          50 permanent items (Final_Permanent_Held_Items)
  item-helpers.ts             the shared move-family vocabulary the items use
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
npx mocha                        # the suite (runs everything: 2417 tests)
python3 tools/fakemon/build.py   # regenerate + report uncompiled effect text
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
