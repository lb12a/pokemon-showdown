# Anleitung — Server starten und testen

Kurzanleitung auf Deutsch. Ausführliche technische Doku:
[`IMPLEMENTATION_NOTES.md`](IMPLEMENTATION_NOTES.md) (was gebaut wurde) und
[`DATA_GUIDE.md`](DATA_GUIDE.md) (eigene Inhalte ergänzen).

---

## 0. Wo liegt der Ordner?

Der Ordner heißt **`pokemon-showdown`** und liegt dort, wo du damals
`git clone` ausgeführt hast. Wenn du PowerShell einfach geöffnet und
`git clone …` eingegeben hast, ist das dein Benutzerordner:

```
C:\Users\<DeinName>\pokemon-showdown
```

**Wiederfinden, falls du unsicher bist** — in PowerShell:

```powershell
Get-ChildItem -Path $HOME -Filter pokemon-showdown -Directory -Recurse -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty FullName
```

Findet das nichts, suche auf der ganzen Platte:

```powershell
Get-ChildItem -Path C:\ -Filter pokemon-showdown -Directory -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 5 -ExpandProperty FullName
```

**In den Ordner wechseln** (Pfad anpassen):

```powershell
cd C:\Users\<DeinName>\pokemon-showdown
```

Ob du richtig bist, erkennst du daran:

```powershell
dir
```

Es müssen unter anderem `package.json`, `pokemon-showdown`, `data`, `server`
und `ANLEITUNG.md` auftauchen.

**Noch gar nicht geklont?** Dann einmalig:

```powershell
cd $HOME
git clone https://github.com/lb12a/pokemon-showdown.git
cd pokemon-showdown
git checkout claude/pokemon-showdown-custom-system-eszso4
npm install
node build
```

Der `git checkout` ist **nicht optional**: ohne ihn landest du auf `master`,
und dort ist von diesem Projekt nichts drin.

---

## 0b. Bist du überhaupt auf dem richtigen Stand?

**Der schnellste Test:** oben rechts im Client steht seit Neuestem eine kleine
Zeile wie

```
claude/pokemon-showdown-custom-system-eszso4 @ 3943f274 · built 2026-09-06 19:09
```

Steht dort *gar nichts*, läuft ein alter Stand. Im Chat geht es auch mit
`/fakemonversion` — antwortet das mit „none - this is an old build", ist es ein
alter Stand.

Die drei Ursachen, in der Reihenfolge, in der sie wirklich vorkommen:

### 1. Der Browser zeigt noch die alte Seite

Mit Abstand am häufigsten. Nach jedem `node build` die Seite mit **Strg+F5**
neu laden — normales F5 reicht nicht immer. (Der Server schickt seine
Client-Dateien inzwischen mit `Cache-Control: max-age=0`, aber eine Seite, die
noch aus der alten Sitzung offen ist, muss trotzdem einmal hart neu geladen
werden.)

### 2. `git pull` ist abgebrochen und du hast es nicht gesehen

Sieht so aus:

```
error: Your local changes to the following files would be overwritten by merge:
        assets/manifest.json
Please commit your changes or stash them before you merge.
Aborting
```

`git pull` bricht dann **ohne** irgendetwas zu holen ab — und `node build`
danach baut fröhlich den alten Stand. Lösung:

```powershell
git stash
git pull
node build
```

(Das passierte, weil `node build` früher `assets/manifest.json` neu geschrieben
hat, eine versionierte Datei. Das tut es nicht mehr; die Datei pflegt jetzt nur
noch `node tools/fakemon/export-client.js`. Der Fehler kann also nicht mehr
auftreten — aber wenn er bei dir noch offen ist, ist der `git stash` oben die
Lösung.)

Danach kontrollieren, dass der Pull wirklich durchlief:

```powershell
git log --oneline -1
```

### 3. Du bist auf dem falschen Branch

Die ganze Arbeit liegt auf `claude/pokemon-showdown-custom-system-eszso4`; auf
`master` liegt unverändertes Pokémon Showdown.

```powershell
git branch --show-current
```

Kommt da `master`, dann:

```powershell
git fetch origin
git checkout claude/pokemon-showdown-custom-system-eszso4
git pull
node build
```

## 1. Holen und starten

Immer **im Ordner `pokemon-showdown`** und auf dem richtigen Branch (siehe
Abschnitt 0b):

```powershell
git checkout claude/pokemon-showdown-custom-system-eszso4
git pull
node build
node pokemon-showdown start --no-security
```

Wenn unten `Test your server at http://localhost:8000` steht, läuft er.
Das Fenster **offen lassen** — es ist der Server. Beenden mit `Strg+C`.

Dann im Browser **http://localhost:8000** öffnen. Das ist der eigene Client,
nicht play.pokemonshowdown.com.

---

## 2. Was du anklicken solltest

### Teambuilder

Ein Pokémon wählen, dann das Item-Auswahlfeld öffnen. Es ist nach Gruppen
unterteilt: *Mega Stone, Core, Food, Consumable, Battle gear, Permanent gear*.
Der eigene Mega-Stein erscheint nur bei dem Pokémon, dem er gehört.

### Mega-Regel prüfen

Zwei Sets vom selben Pokémon mit Mega-Form bauen (z. B. **Hallowisp**):
eins **mit** Hallowispite, eins **ohne** Item. Im Kampf den Mega-Knopf drücken:

| | Ergebnis |
| --- | --- |
| **mit** eigenem Stein | wird zu Hallowisp-Mega: +100 Statuswerte, Typ Grass/Ghost/**Fairy**, Mega-Fähigkeit *Sugar Pile* |
| **ohne** Stein | bleibt Hallowisp: **+20 auf alle** Werte, gleiche Fähigkeit, gleicher Typ |
| **fremder** Stein | genau wie ohne Stein |

### Items im Kampf

Gut sichtbar sind:

* **Sticky Honey-Comb** — Angreifer verliert Initiative bei Berührungsattacken
* **Volt-Spore Shroom** — heilt Paralyse sofort und gibt +1 Initiative
* **Assault Vestment** — Statusattacken sind ausgegraut, dafür 1,5× Sp.-Verteidigung
* **Granite Anchor** — kann nicht aus dem Kampf gezwungen werden
* **Splinter-Bark Husk** — Angreifer bekommt 1/10 des Schadens zurück

### Fähigkeiten im Kampflog

Sobald eine Fähigkeit tatsächlich etwas bewirkt — Schaden verändert, Werte
verschiebt, eine Attacke umbaut —, steht das jetzt im Log:

```
Pumpini's Grass-Starter took effect!
```

Die Zeile kommt **vor** der Wirkung, damit man sieht, wovon die Zahl kommt.
Eine Fähigkeit, deren Bedingung gerade nicht zutrifft, bleibt still, und pro
Zug wird jede Fähigkeit höchstens einmal gemeldet.

### Doppelkämpfe: eigenes Teammitglied angreifen

Im Doppelkampf eine Attacke anklicken — jetzt leuchten **beide** Seiten als
Ziel auf, also auch dein eigenes zweites Pokémon. Anklicken und es wird
angegriffen (oder geheilt, je nach Attacke).

Attacken, die ausdrücklich einen Verbündeten brauchen (z. B. **Nectar Heal**),
funktionieren dadurch überhaupt erst — vorher gab es dafür die Fehlermeldung
`Can't move: … needs a target`.

### Beide Teams selbst bauen

Im Bot-Panel bei **Bot team** die Option *„You pick both teams"* wählen — dann
erscheint ein zweites Auswahlfeld **„The bot's team"**. Du suchst dir ein
gespeichertes Team für dich und ein anderes für den Bot aus. Beide werden vom
Server geprüft; ein illegales Bot-Team wird mit Begründung abgelehnt.

### Level 1 bis 100

Im Teambuilder hat jedes Pokémon jetzt ein Feld **Level**. Von 1 bis 100 frei
wählbar, und die Werte skalieren wirklich mit: dasselbe Pumpini hat auf Level
100 252 KP und auf Level 37 nur 99.

### Neue Formen ausprobieren

Im Teambuilder tauchen jetzt auf:

* **Tigitz** (Normal/Kampf) und **Tigitz-Fae** (Normal/Fee) — gleiche Werte,
  jede Form entwickelt sich in die passende Weiterentwicklung
* **Tigraith** (Fee/Geist, spezieller Angreifer) und **Tigraxe** (Kampf/Feuer,
  dieselben Werte mit vertauschter physischer und spezieller Hälfte)
* **Tigraith-Crowned** (+Sp.Ang, Dritttyp Eis) und **Tigraxe-Axed** (+Ang,
  Dritttyp Stahl) mit legendären Werten, sowie **Hypercrowned** und
  **Hyperaxed**, die dieselbe Punktzahl komplett in Initiative und Angriff
  stecken
* **Budpup / Budruff / Mudruff** je in **Bobtail** (+Vert), **Beagle** (+Ang)
  und **Dalmatian** (+Init) — die Fellart bleibt beim Entwickeln erhalten

### Teams kopieren (Showdown-Format)

Im Teambuilder auf **Import / Export**. Oben steht dein Team im normalen
Pokémon-Showdown-Textformat, das du herauskopieren kannst; hineinkopierten
Text übernimmst du mit *„Replace team with this text"* oder
*„Import as a new team"*.

```
Bunbombard (M) @ Bunbombardite
Ability: Kamikaze
Level: 50
EVs: 4 HP / 252 Atk / 252 Spe
Adamant Nature
IVs: 0 SpA
- All-Out Cry
- Tsunami
```

Das **(M)** hinter dem Namen ist die Mega-Markierung (kein Geschlecht — das
gibt es hier nicht): es sagt, dass **der Bot** dieses Pokémon
megaentwickeln darf. Auf deinem eigenen Team hat es keine Wirkung, weil bei dir
ohnehin jedes Pokémon megaentwickeln kann.

### Dem Bot vorschreiben, was megaentwickeln darf

Im Teambuilder gibt es pro Pokémon das Häkchen **„Bot may Mega
Evolve this one"**. Baust du damit ein Team und gibst es dem Bot (Modus *„You
pick both teams"*), gilt:

* mehrere angehakt → der Bot sucht sich eines davon aus
* **genau eines angehakt → der Bot megaentwickelt es garantiert**, auch auf
  „Easy", wo er es sonst nie tut
* keines angehakt → er entscheidet selbst

### EVs, IVs und Wesen

Jedes Pokémon hat jetzt sechs **EV**-Felder (mit Zähler bis 510),
sechs **IV**-Felder und alle 25 **Wesen** zur Auswahl — genau wie bei normalen
Pokémon. Darunter steht immer, welche Werte dabei herauskommen. Wer es
schnell will, nimmt *„Fill spread"* und lässt eine fertige Verteilung
eintragen.

**Kein Item und weniger als vier Attacken sind erlaubt.** Ein Pokémon mit
einer einzigen Attacke und ohne Item ist ein gültiges Set.

### Nach dem Sieg: EXP und Preisgeld

Gewinnst du, erscheint unter den Knöpfen die Tabelle **Spoils**: wie viel
EXP jedes deiner beteiligten Pokémon nach den normalen
Pokémon-Formeln bekommen würde und wie viel Preisgeld. Es wird nur
angezeigt und nichts gespeichert.

### Bot

Im Chat eintippen:

```
/fakemonbot singles, ShadowMaster, random, hard
/fakemonbot doubles, TestDummy, swap, normal
```

### Gegen einen Freund

```
/fakemonchallenge <Name>, doubles
```

### Dex nachschlagen

```
/fakemondex Hallowisp
```

---

## 3. Automatisch prüfen, ohne Klicken

Neues PowerShell-Fenster, wieder **im Ordner `pokemon-showdown`**:

```powershell
node tools/fakemon/check.js
```

Muss am Ende `ERRORS: 0` ausgeben. Die Warnungen („no sprite yet") sind
normal — die Bilder sind noch Platzhalter.

```powershell
npx mocha
```

Muss `2445 passing` melden, `0 failing`.

---

## 4. Selbst Attacken und Fähigkeiten ändern

Ausführlich steht das in [`DATA_GUIDE.md`](DATA_GUIDE.md) unter *„The two
questions everyone asks"*. Kurzfassung:

**Fähigkeiten eines Pokémon ändern** → `tools/fakemon/build.py`,
Tabelle `SPECIES_FIXUPS`:

```python
SPECIES_FIXUPS = {
    'Chronowl': {'abilities': {'0': 'Slowmofly', '1': 'Reckless'}},
}
```

**Attacken ändern** → drei Wege:

1. alle Pokémon mit einer bestimmten Fähigkeit sollen eine Art
   Attacke bekommen → `ABILITY_SYNERGY` in `build.py`
2. eine Effekt-Attacke auf bestimmte Linien verteilen → `EFFECT_MOVES` in
   `build.py`
3. genau ein Pokémon soll genau eine Attacke lernen →
   `data/mods/fakemon/learnsets.ts`, im `Overrides`-Block

Danach immer:

```powershell
python3 tools/fakemon/build.py
node build
node tools/fakemon/check.js
```

Der letzte Befehl muss `ERRORS: 0` sagen — er meckert auch, wenn du dich
vertippt hast (`unknown ability "Slowmofli"`).

## 5. Wenn etwas nicht stimmt

**Es sieht alles aus wie vorher / neue Sachen fehlen**
→ Fast immer der falsche Branch. Siehe Abschnitt 0b: `git branch --show-current`
muss `claude/pokemon-showdown-custom-system-eszso4` sagen. Danach `node build`
und **Strg+F5**. Die Zeile oben rechts im Client verrät dir sofort, welcher
Stand wirklich läuft.

**Es erscheinen alte Pokémon oder alte Items im Teambuilder**
→ `node build` noch einmal laufen lassen, dann die Seite mit **Strg+F5**
neu laden. Der Browser hält die Dex-Datei im Zwischenspeicher.

**`node` wird nicht gefunden**
→ Node.js ist nicht installiert oder nicht im PATH. Prüfen mit `node -v`.

**Port 8000 ist belegt**
→ `node pokemon-showdown start --no-security 8123` und dann
http://localhost:8123 öffnen.

**Alle Bilder sind derselbe graue Platzhalter**
→ So ist es gedacht, bis du echte Grafiken einfügst. Wohin sie gehören,
steht in [`assets/README.md`](assets/README.md); `assets/manifest.json`
listet alle 1686 erwarteten Dateien mit ihrem Namen auf.
