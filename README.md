# SzóPárbaj

Magyar, böngészőben futó multiplayer Wordle-stílusú szókirakó játék. Statikus frontend, GitHub Pages kompatibilis, Firebase Realtime Database szinkronnal.

## Mi változott ebben a verzióban?

- Egyetlen közös szólista van: `data/words.json`.
- Nincs külön `starter-words.json` és `accepted-words.json` kezelés.
- Minden aktív szó egyszerre tippelhető és későbbi megfejtésként is kisorsolható.
- Host által bedobott szó azonnal tippelhető mindkét játékosnak.
- Host szó nem cseréli le az aktuális megfejtést, csak a következő köröktől kerülhet sorsolásba.
- Ha egy játékos kifogy a tippekből, elindul az állítható végjáték-idő.
- Ha mindkét játékos kifogyott vagy a végjáték-idő lejár, a kör véget ér és megjelenik a megfejtés.
- Az ellenfél panel már betű nélküli mini táblát mutat, nem csak szöveges zöld/sárga darabszámot.
- Bekerült a Solo mód: egyedül is indítható játék, pontozással, XP-vel és körváltással.
- A tile animációk vissza vannak fogva, hogy ne mozogjanak folyamatosan minden Firebase frissítésnél.

## Fájlstruktúra

```text
wordle-multiplayer/
├─ index.html
├─ admin.html
├─ README.md
├─ data/
│  └─ words.json
├─ assets/
│  ├─ css/
│  │  └─ style.css
│  ├─ js/
│  │  ├─ config.example.js
│  │  ├─ config.js
│  │  ├─ firebase-client.js
│  │  ├─ app.js
│  │  ├─ game-engine.js
│  │  ├─ room-service.js
│  │  ├─ profile-service.js
│  │  ├─ word-service.js
│  │  ├─ scoring.js
│  │  ├─ audio.js
│  │  └─ admin.js
│  └─ sounds/
```

## Firebase beállítás

A játék Firebase Realtime Database-t használ.

1. Hozz létre Firebase projektet.
2. Adj hozzá Web appot.
3. Kapcsold be a Realtime Database-t.
4. Teszthez a Rules fülre:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

5. Másold ki a Firebase config értékeit az `assets/js/config.js` fájlba.

Példa:

```js
window.APP_CONFIG = {
  firebase: {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  }
};
```

## Helyi futtatás

A böngésző fetch miatt ne dupla kattintással nyisd, hanem kis helyi szerverrel:

```bash
cd wordle-multiplayer
python -m http.server 8080
```

Majd:

```text
http://localhost:8080/index.html
```

## GitHub Pages deploy

1. Töltsd fel a teljes `wordle-multiplayer` mappát egy GitHub repóba.
2. GitHub repo Settings -> Pages.
3. Source: Deploy from branch.
4. Branch: `main`.
5. Folder: `/root`.

## Admin oldal

Nyisd meg:

```text
admin.html
```

Az admin oldal a `data/words.json` fájlt kezeli. Importálhatsz új szavakat, tilthatsz szavakat, exportálhatod a JSON-t, és opcionálisan mentheted GitHubra.

A GitHub token csak böngészőben van használva. Ez nem teljesen biztonságos, ezért csak saját admin használatra ajánlott. Ne hardcode-old a tokenedet a fájlokba.

## Szólista szabály

A canonical fájl:

```text
data/words.json
```

Formátum:

```json
{
  "version": 3,
  "language": "hu",
  "policy": "single-list-all-enabled-words-are-guesses-and-answers",
  "words": [
    { "word": "ablak", "length": 5, "enabled": true }
  ]
}
```

Minden `enabled: true` szó:

- elfogadott tipp,
- lehetséges megfejtés,
- megtartja a magyar ékezeteket,
- nem kezeli az `o` és `ó` betűt azonosként.

## Játék közbeni szó hozzáadás

Aktív játék közben lehet új szót javasolni.

Viselkedés:

- 1v1 és Party módban mindkét játékos javasolhat szót, de az ellenfélnek jóvá kell hagynia,
- jóváhagyás után az új szó bekerül Firebase-be,
- mindkét kliens automatikusan frissíti a szó-cache-t,
- az ellenfél toast értesítést és kiemelt panelt kap, ha jóváhagyás vár rá,
- a jelenlegi megfejtés nem változik,
- következő köröktől a szó megfejtésként is kisorsolható,
- Solo módban nincs ellenfél, ezért a szó azonnal bekerül a szótárba.

## Végjáték timer

Lobbyban állítható: `Végjáték timer, mp`.

Alapérték: 300 másodperc.

Ha az egyik játékos kifogy a próbákból, elindul ez az idő. A másik játékosnak eddig van ideje megfejteni. Ha lejár, a kör lezárul, és a megfejtés megjelenik. Ha mindkét játékos kifogyott, a kör azonnal lezárul.

## Játékmódok

### Solo mód

Egyjátékos gyakorló mód. Indítható közvetlenül a kezdőlapról a `Solo játék` gombbal, vagy lobbyban a játékmódnál választható. Ugyanazt a táblát, pontozást, XP-t, időlimitet és körváltást használja, mint a multiplayer módok, csak ellenfél nélkül.

### 1v1

Két játékos ugyanazt a szót fejti. Az ellenfél tényleges betűi nem jelennek meg aktív körben. A panel csak betű nélküli mini táblát mutat zöld/sárga/szürke mezőkkel.

### Party mód

Két játékos közösen dolgozik. Van saját tábla, másik játékos tábla és közös board.

## Hangok

A `assets/sounds/` mappában vannak alap wav fájlok. A hangok kikapcsolhatók, a hangerő mentődik localStorage-ba.

## Fontos biztonsági megjegyzés

Ez statikus frontend. Nincs saját szerver. A Firebase szabályokkal lehet szigorítani, hogy ki írhat adatot. A teszt rules nyitott, éles oldalon nem ideális.

## v11 frissítés

- Játék közben alapból bekapcsolt, WebAudio alapú synth háttérzene indul. Böngészőkorlátozás miatt az első kattintás vagy billentyűleütés után indul el biztosan.
- Gépelés közben a jelenlegi sor kap segítő körvonalakat a már beadott tippek alapján:
  - zöld körvonal: az adott betű korábban ugyanott zöld volt,
  - sárga körvonal: a betűről már tudható, hogy szerepel a szóban,
  - piros körvonal: a betűről a korábbi tippek alapján tudható, hogy nem jó vagy a pozíció már más betűvel zárva van.
- A segítő körvonal nem kapcsolható ki, mert a játékmechanika része.
- Gépeléskor már nem renderelődik újra a teljes játékfelület és billentyűzet, csak az aktív sor frissül.


## v16 Party közös segítő jelzések

Party módban a játék most a közös fő táblából tanult betűinformációkat használja mindkét játékosnál. Ha a társad beküld egy tippet, és abból kiderül, hogy egy betű nincs a szóban, akkor nálad is piros jelzést kap az a betű gépelés közben. Ha kiderül, hogy egy betű jó vagy szerepel a szóban, a saját alsó táblád és a billentyűzet is ezt az információt használja.
