<h1 align="center">🏆 World Cup 2026 — Bracket Predictor</h1>

<p align="center">
  Predict the FIFA World Cup 2026 knockout bracket, share it with friends through a single link, and watch the scores settle as the real results come in.
</p>

<p align="center">
  <a href="https://bidwat.github.io/worldcup-2026-bracket-predictor/"><b>▶ Open the app</b></a>
</p>

---

## What it is

A simple, free web app for the World Cup 2026 knockout rounds. Pick who advances from the Round of 32 all the way to the final, give your bracket a name, and send it to your friends. As the tournament plays out, the app shows whose predictions were right — yours and theirs — and ranks everyone on a leaderboard.

Your brackets are saved in your own browser, and a shared bracket is carried entirely inside its link. There's no sign-up and nothing to install.

## How to use it

**1. Build your bracket.** Tap **New bracket**, then click the team you think wins each match. Your pick carries forward round by round, and your predicted champion appears at the top as soon as you reach the final. In a hurry? **Randomize** fills one in for you to tweak.

**2. Name it and share.** Hit **Save & share**, give your bracket a name, and send the link via WhatsApp, Telegram, X, Facebook, Reddit, email, or copy it anywhere. Friends who open the link see your bracket as a read-only board and can save it or build their own.

**3. Watch the scores.** The app checks the real results automatically every time you open it. Played matches are graded ✓ or ✗ on every saved bracket, and later rounds matter more:

| Round | Round of 32 | Round of 16 | Quarter-finals | Semi-finals | Final |
|------:|:-----------:|:-----------:|:--------------:|:-----------:|:-----:|
| **Points** | 1 | 2 | 4 | 8 | 16 |

A perfect bracket is worth **80 points**. Once a match is played its result locks in; rounds that haven't been played yet stay editable.

**4. Compare.** The **Compare** tab ranks every bracket you've saved — yours and your friends' — by points, so you always know who's winning the pool.

## Features

- 🗺️ A real, connector-linked bracket so it's always clear who plays who next
- 🔗 Tiny share links — the whole bracket fits in the URL, no server involved
- 👀 Shared links open as a clean read-only board with the bracket's name
- 📸 One-tap Instagram-story image (9:16) of your bracket, ready to post
- 💾 Save friends' brackets and rank everyone on a leaderboard
- 🔄 Live results check on every visit, with round-weighted scoring
- 🌗 Light and dark themes, responsive on phone and desktop
- 🏳️ Country flags that display correctly on Windows too

---

## Developer notes

Plain static HTML/CSS/JS — no framework, no build step. Three classic scripts load in order: `data.js` (fixtures, teams, config) → `bracket.js` (stateless core: resolve, score, encode/decode, share, storage, live feed) → `app.js` (UI). State lives in `localStorage`; shared state rides in the URL hash.

**Run locally**

```bash
npm start          # serves the folder (or just open index.html)
```

**Live results feed** — configured in `data.js` under `feed`; defaults to TheSportsDB's free, keyless, CORS endpoint (league 4429, season 2026). Finished knockout games are mapped to the bracket progressively. The free key returns a limited sample — drop your own key into `feed.sportsdb.key` for full coverage, or set `feed.type:"json"` and a `resultsUrl` returning `{updated, results:{matchId:teamCode}}`. The **Enter results** dialog is a manual backstop.

**Analytics** — optional Google Analytics 4 (`page_view`, `bracket_created`, `bracket_shared`). The Measurement ID is **not** committed; it's injected at deploy time from the GitHub Actions **variable** `GA4_ID` (`scripts/inject-env.mjs` fills the `analytics.ga4Id` placeholder in `data.js`). For local analytics, put `GA4_ID=G-…` in a `.env` and run `npm run inject`. Note: a GA4 Measurement ID is inherently visible in the live page — keeping it out of the repo is about hygiene, not secrecy. GA4 reports unique visitors and country/city, not raw IPs.

**Deploy** — pushing to `main` triggers `.github/workflows/deploy.yml`, which assembles the static files, injects `GA4_ID`, and publishes to GitHub Pages.

**Updating tournament data** — edit `matches`/`teams` in `data.js`. The `matches` array is in canonical order, which is also the share-encoding contract; if you reorder it, bump `CODE_VERSION` in `bracket.js`.

---

<p align="center"><sub>© Bidwat Pokhrel, 2026</sub></p>
