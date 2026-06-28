<h1 align="center">🏆 World Cup 2026 — Bracket Predictor</h1>

<p align="center">
  Predict the FIFA World Cup 2026 knockout bracket, share it with friends through a single short link, and watch the scores settle as the real results come in.
</p>

<p align="center">
  <b>Frontend-only</b> · no backend · no accounts · no database<br/>
  Brackets live in your browser; a shared bracket travels entirely inside the URL.
</p>

---

## Highlights

- **Real fixtures, always-on live results.** Ships with the actual 2026 knockout draw (Round of 32 → Final) and checks a live results feed **every time the app opens or reloads**, so scores update on their own.
- **A real bracket, not a list.** A connector-linked tournament tree lays each match next to the two games that feed it, so it's always obvious who advances where.
- **Tiny share links.** A complete 31-match bracket is encoded into roughly a dozen characters in the URL — the named bracket and every pick, with nothing stored server-side.
- **Open to view, not to edit.** A shared link opens the bracket as a clean read-only board titled with its name, plus a one-tap *Create your own* to start your bracket.
- **Save friends' brackets.** Keep everyone's predictions side by side and rank them on the leaderboard.
- **Light & dark themes**, responsive from phone to desktop, with country flags that render correctly on Windows too.

## Run it

No build step, no dependencies.

- **Double-click `index.html`** — it runs straight from the file system, or
- serve the folder for cleaner share URLs:
  ```bash
  npx serve .
  # or
  python -m http.server 8000
  ```

> An internet connection is used for two optional niceties: the live results feed and two small CDN assets (an icon pack and a flag font). The app remains fully usable offline — flags simply fall back to two-letter codes and results can be entered by hand.

## How it works

### Building a bracket
Click a team in any match to advance them; the pick flows forward through every round to the final. Change an earlier game and the path beyond it resets so you re-confirm it. **Randomize** fills an instant bracket to tweak. Your predicted champion shows inline as soon as the final is decided.

### Scoring
Each pick is graded against the real result. Rounds are weighted so later stages matter more:

| Round | Round of 32 | Round of 16 | Quarter-finals | Semi-finals | Final |
|------:|:-----------:|:-----------:|:--------------:|:-----------:|:-----:|
| **Points** | 1 | 2 | 4 | 8 | 16 |

Every round contributes the same total (16 points), so a perfect bracket is worth **80**. Once a match is played it locks — a correct or incorrect call is recorded and can't be retro-edited — while un-played rounds stay editable.

### Sharing
Everything needed to reconstruct a bracket is packed into the URL hash, so links work on any static host (or `file://`). Built-in buttons share to **WhatsApp, Telegram, X, Facebook, Reddit, and email**, alongside copy-link and the native mobile share sheet. Opening a link shows the bracket read-only with its title and a *Create your own* call to action; recipients can also save it to compare scores.

#### Why the link stays short
Each of the 31 knockout matches is a single positional choice — top slot or bottom slot advances — stored as two bits in canonical bracket order, prefixed with a version byte and base64url-encoded. The bracket's name is the only other thing in the link.

## Results feed

The app checks for live results automatically on every load (and via **Refresh results**), configured in `data.js` under `feed`:

```js
feed: {
  type: "thesportsdb",
  sportsdb: { key: "3", leagueId: 4429, season: "2026", knockoutFrom: "2026-06-28" }
}
```

The default source is **TheSportsDB's** free, keyless, CORS-enabled World Cup endpoint. Finished knockout games are matched to the bracket and their winners filled in progressively as rounds settle; common team-name variants (`USA`, `Bosnia-Herzegovina`, `Cote d'Ivoire`, …) are mapped automatically.

- **Coverage:** the free public key returns a limited sample of events. For full coverage, drop your own TheSportsDB key into `feed.sportsdb.key`. Games decided by a penalty shootout are left undecided by the feed.
- **Custom source:** set `feed.type: "json"` and point `resultsUrl` at any CORS-enabled endpoint returning `{ "updated": "…", "results": { "73": "CAN" } }` (match id → team code).
- **Manual:** **Enter results** lets you set any winner by hand — handy for a private pool or penalty-shootout games. It re-scores every saved bracket instantly.

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | App shell, theme bootstrap, CDN assets |
| `styles.css` | Blue theme with light/dark tokens, responsive layout, bracket connectors |
| `data.js` | Tournament fixtures, teams, round weights, feed config, results |
| `bracket.js` | Stateless core — resolve, score, encode/decode, share, storage, live feed |
| `app.js` | Rendering and interaction |

## Tech notes

- Vanilla JavaScript, no framework or build tooling — three classic scripts loaded in order.
- State persists in `localStorage`; shared state is carried in the URL hash. There is no server component.
- Country flags use the bundled Twemoji flag font so emoji flags render on Windows, which otherwise shows two-letter codes.
- Icons are Font Awesome; the live feed is TheSportsDB. Both load over HTTPS from a CDN.

## Updating the tournament data

The bundled bracket reflects the published 2026 knockout draw. If the draw, dates, or venues change, edit the `matches` and `teams` in `data.js`. The `matches` array is in canonical order, which is also the contract used by the share encoding — if you reorder it, bump `CODE_VERSION` in `bracket.js`.

---

<p align="center"><sub>© Bidwat Pokhrel, 2026</sub></p>
