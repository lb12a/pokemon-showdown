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
```

---

## 1. Holen und starten

Immer **im Ordner `pokemon-showdown`**:

```powershell
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

Muss `2417 passing` melden, `0 failing`.

---

## 4. Wenn etwas nicht stimmt

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
