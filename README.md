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

## Host gyors szó bedobás

Aktív játék közben a host hozzáadhat egy új szót.

Viselkedés:

- az új szó azonnal bekerül Firebase-be,
- mindkét kliens automatikusan frissíti a szó-cache-t,
- az ellenfél toast értesítést kap,
- a jelenlegi megfejtés nem változik,
- következő köröktől a szó megfejtésként is kisorsolható.

## Végjáték timer

Lobbyban állítható: `Végjáték timer, mp`.

Alapérték: 300 másodperc.

Ha az egyik játékos kifogy a próbákból, elindul ez az idő. A másik játékosnak eddig van ideje megfejteni. Ha lejár, a kör lezárul, és a megfejtés megjelenik. Ha mindkét játékos kifogyott, a kör azonnal lezárul.

## Játékmódok

### 1v1

Két játékos ugyanazt a szót fejti. Az ellenfél tényleges betűi nem jelennek meg aktív körben. A panel csak betű nélküli mini táblát mutat zöld/sárga/szürke mezőkkel.

### Party mód

Két játékos közösen dolgozik. Van saját tábla, másik játékos tábla és közös board.

## Hangok

A `assets/sounds/` mappában vannak alap wav fájlok. A hangok kikapcsolhatók, a hangerő mentődik localStorage-ba.

## Fontos biztonsági megjegyzés

Ez statikus frontend. Nincs saját szerver. A Firebase szabályokkal lehet szigorítani, hogy ki írhat adatot. A teszt rules nyitott, éles oldalon nem ideális.
