# SzóPárbaj – Magyar multiplayer Wordle

Ez egy teljes, statikus, böngészőből futó magyar Wordle-stílusú multiplayer játék. GitHub Pages-re készült, nincs saját backend. A valós idejű szobákhoz, profilokhoz, XP-hez, statisztikához, dinamikus szólistához és meccsállapothoz Firebase Realtime Database-t használ.

## Fő funkciók

- Magyar UI
- 1v1 párbaj mód
- Party kooperatív mód két játékossal
- Szobakódos csatlakozás
- Egyszerű név alapú profil, email és jelszó nélkül
- Helyi `userId` mentés localStorage-ban
- XP, szint, statisztikák
- Host beállítások: mód, szóhossz, próbák, körök, célpontszám, időlimit
- Host gyors szó hozzáadás aktív meccs közben
- Firebase dinamikus szólista
- Admin oldal szólista kezeléshez
- GitHub API mentés admin használatra
- Magyar ékezetes betűk támogatása
- Hosszú szavak egy sorban, dinamikus tile mérettel
- Hangkezelés, némítás, SFX, zene, hangerő
- Programmal generált placeholder hangok

## Fájlstruktúra

```text
wordle-multiplayer/
├─ index.html
├─ admin.html
├─ README.md
├─ data/
│  ├─ words.json              # fő, egyesített szólista
│  ├─ starter-words.json      # kompatibilitási másolat
│  └─ accepted-words.json     # kompatibilitási másolat
├─ assets/
│  ├─ css/
│  │  └─ style.css
│  ├─ js/
│  │  ├─ config.example.js
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
│     ├─ README.txt
│     ├─ key.wav
│     ├─ reveal.wav
│     ├─ invalid.wav
│     ├─ correct.wav
│     ├─ win.wav
│     ├─ lose.wav
│     ├─ level-up.wav
│     ├─ next-round.wav
│     └─ music-loop.wav
```

## Helyi futtatás

A Firebase nélküli megnyitásnál az oldal betölt, de multiplayer szoba nem hozható létre. A teljes működéshez Firebase config kell.

Egyszerű helyi teszt:

```bash
cd wordle-multiplayer
python -m http.server 8080
```

Majd nyisd meg:

```text
http://localhost:8080/index.html
http://localhost:8080/admin.html
```

A `file://` megnyitás nem ajánlott, mert a JSON fájlok `fetch()` betöltése böngészőtől függően tiltva lehet.

## Firebase free tier beállítás

1. Menj a Firebase Console-ba.
2. Hozz létre új projektet.
3. Add hozzá a Web appot.
4. Másold ki a Firebase web configot.
5. Engedélyezd a **Realtime Database** szolgáltatást.
6. Hozd létre az adatbázist teszt módban vagy saját szabályokkal.
7. A csomagban van egy üres `assets/js/config.js` placeholder, illetve egy `assets/js/config.example.js` minta. Töltsd ki a `config.js` fájlt:

```js
window.APP_CONFIG = {
  firebase: {
    apiKey: "...",
    authDomain: "...",
    databaseURL: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  }
};
```

Fontos: a Firebase web config önmagában nem titkos kulcs, de a biztonságot a Firebase rules adják.

## Realtime Database teszt rules

Fejlesztéshez, gyors tesztre használható, de élesben túl nyitott:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Élesítés előtt szigorítani kell. Mivel ez v1-ben email/jelszó nélküli, localStorage alapú azonosítást használ, nem nyújt erős felhasználói hitelesítést. Nyilvános, versenyszerű, csalásbiztos játékhoz később Firebase Auth és komolyabb rules kellenek.

## GitHub Pages deploy

1. Hozz létre egy GitHub repót.
2. Másold fel a projekt fájljait.
3. Commitold a fájlokat.
4. A repo Settings → Pages menüben válaszd ki a branch-et, például `main`, root mappával.
5. Pár perc után elérhető lesz a GitHub Pages URL.

Példa:

```bash
git init
git add .
git commit -m "Initial SzóPárbaj game"
git branch -M main
git remote add origin https://github.com/USER/REPO.git
git push -u origin main
```

## Admin oldal használata

Nyisd meg:

```text
admin.html
```

Itt tudsz:

- helyi starter szólistát betölteni
- egy szót hozzáadni
- tömegesen importálni szavakat
- válasz szóként jelölni
- csak elfogadott tippként jelölni
- tiltani szavakat
- JSON-t exportálni
- Firebase-be küldeni a szavakat azonnali használatra
- GitHubra menteni, ha megadod a tokenedet és repo adataidat

## GitHub token figyelmeztetés

A GitHub token böngészőben történő használata nem teljesen biztonságos. Csak saját admin használatra ajánlott, lehetőleg lokálisan vagy privát környezetben.

Ne hardcode-old a tokent a projektbe.
Ne commitold a tokenedet.
Ha lehet, használj korlátozott jogosultságú, csak az adott repóra érvényes fine-grained tokent.

Admin mentéshez szükséges mezők:

- Owner
- Repo
- Branch
- JSON path, alapból `data/words.json`
- GitHub token

## Szólisták

Két fő JSON fájl van:

```text
data/starter-words.json
```

Ez a jó, tiszta válasz szavakat tartalmazza.

```text
data/accepted-words.json
```

Ez az összes elfogadható tippet tartalmazza, beleértve a válasz szavakat és extra ragozott/toldalékos alakokat.

A játék az ékezeteket nem mossa össze. Az `o` és az `ó` külön betű. Az `u`, `ú`, `ü`, `ű` szintén külön betű.

## Host gyors szó hozzáadás

Aktív játék közben a host kis panelen hozzáadhat új szót.

Kötelező viselkedés:

- Az új szó azonnal elfogadott tipp lesz az aktuális körben.
- Nem cseréli le az aktuális megfejtést.
- Csak következő köröktől lehet válasz szó, ha a host ezt engedélyezi.

Ez Firebase `words/dynamic` alá mentődik.

## 1v1 adatvédelem játék közben

Aktív 1v1 körben az ellenfél tippjei nem jelennek meg betű szerint. A játék csak ennyit mutat:

- ellenfél gépel-e
- próbálkozásszám
- eltelt idő
- legutóbbi tipp zöld/sárga száma
- megfejtette-e

Statikus frontendnél a kliensoldali kód teljesen nem csalásbiztos. Ez v1 prototípushoz vállalható, de komoly nyilvános versenyhez backend vagy Cloud Functions kellene.

## Pontozás és XP

A pontozás az `assets/js/scoring.js` fájlban van.

Alap képlet:

```text
basePoints = wordLength * 10
attemptBonus = basePoints * próbálkozás hatékonyság
speedBonus = basePoints * gyorsaság
winnerBonus = 1v1 győztesnek basePoints * 0.5
XP = totalRoundPoints * difficultyMultiplier
```

Szorzók:

- 3–5 betű: 1.0
- 6–8 betű: 1.2
- 9–12 betű: 1.5
- 13+ betű: 2.0
- nagyon kevés próbánál extra nehézségi bónusz

## Hangok

A `assets/sounds` mappában egyszerű, generált placeholder WAV hangok vannak.

Cserélheted őket saját free-to-use / royalty-free hangokra ugyanilyen fájlnévvel.

## Korlátok v1-ben

- Nincs email/jelszó login.
- Nincs globális leaderboard.
- Nincs spectator mód.
- Nincs chat.
- Nincs host migráció, ha a host kilép.
- A kliensoldali statikus app nem teljesen csalásbiztos.
- Komoly élesítéshez Firebase Auth, szigorú rules és esetleg Cloud Functions javasolt.

## Gyors hibakeresés

**Nem tudok szobát létrehozni**

Ellenőrizd, hogy van-e `assets/js/config.js`, és benne van-e a `databaseURL`.

**A Firebase státusz sárga**

A config nincs kitöltve vagy hibás.

**A szavak nem töltődnek be**

Helyi fájlból nyitottad meg. Futtasd HTTP szerverrel:

```bash
python -m http.server 8080
```

**GitHub mentés 401/403**

A token hibás, lejárt, vagy nincs repo write jogosultsága.

**Mobilon túl hosszú a szó**

A játék próbálja egy sorban tartani. Nagyon hosszú szavaknál kisebb tile méretre vált, de telefonon a 18+ betű már kényes lehet.


## v2 javítások

- A szavak mostantól egy fő fájlban vannak: `data/words.json`.
- Ha egy játékos elhasználja az összes próbáját, elindul a host által állítható „Végjáték timer”. Alap: 300 mp.
- Ha mindkét játékos kifogy a próbákból, vagy a végjáték timer lejár, a kör lezárul és megjelenik a megfejtés.
- 1v1 módban az ellenfél tippjei továbbra sem látszanak betűkkel, viszont a bal panelen megjelenik egy kicsi, betű nélküli ellenfél-tábla zöld/sárga/szürke állapotokkal.
- A host által gyorsan hozzáadott szó azonnal tippelhető, és erről a másik játékos toast értesítést kap.
- A tile animációk nem indulnak újra minden Firebase frissítésnél, így a tábla nem „remeg” folyamatosan.
