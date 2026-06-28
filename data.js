/*
 * data.js — Tournament data for the 2026 FIFA World Cup knockout stage.
 *
 * `matches` is listed in CANONICAL ORDER (R32 -> R16 -> QF -> SF -> Final).
 * That order is the contract used to pack/unpack predictions into a short
 * share code, so DO NOT reorder it without bumping CODE_VERSION in bracket.js.
 *
 * Concrete slots use {team:"COD"}. Later rounds reference the winner of an
 * earlier match with {win: <matchId>}.
 *
 * `results` holds OFFICIAL winners (matchId -> team code) once games are played.
 * It is empty at the start of the knockout stage and gets filled either by a
 * live feed (resultsUrl) or by the local "official results" editor in the app.
 */
window.WC_DATA = {
  tournament: "FIFA World Cup 2026",
  updated: "2026-06-27",

  // LIVE RESULTS FEED. The app checks this automatically every time it opens or
  // reloads (see WC.fetchResults / app boot). It is NOT optional — there is
  // always an active source. The default uses TheSportsDB's free, keyless,
  // CORS-enabled World Cup endpoint and progressively maps finished knockout
  // games to bracket winners.
  feed: {
    type: "thesportsdb",              // "thesportsdb" | "json" | "none"
    sportsdb: {
      key: "3",                       // free public test key; swap for your own for full coverage
      leagueId: 4429,                 // FIFA World Cup on TheSportsDB
      season: "2026",
      knockoutFrom: "2026-06-28"      // only games on/after this date count toward the knockout bracket
    }
  },

  // Used only when feed.type === "json". Must return: {updated, results:{matchId:teamCode}}.
  resultsUrl: "",

  // Optional, privacy-friendly usage analytics via Google Analytics 4.
  // Tracks page_view (site opens), bracket_created and bracket_shared.
  // GA4 reports unique visitors and country/city but NOT raw IP addresses.
  //
  // Left blank here on purpose — the Measurement ID is injected at deploy time
  // from the GitHub Actions variable GA4_ID (see scripts/inject-env.mjs), so it
  // stays out of the committed source. For local analytics, put GA4_ID in .env
  // and run `npm run inject`. Blank = no GA script loads, nothing is tracked.
  analytics: { ga4Id: "" },

  rounds: [
    { key: "R32", name: "Round of 32",     pts: 1 },
    { key: "R16", name: "Round of 16",     pts: 2 },
    { key: "QF",  name: "Quarter-finals",  pts: 4 },
    { key: "SF",  name: "Semi-finals",     pts: 8 },
    { key: "F",   name: "Final",           pts: 16 }
  ],

  teams: {
    RSA: { name: "South Africa",          flag: "🇿🇦" },
    CAN: { name: "Canada",                flag: "🇨🇦" },
    GER: { name: "Germany",               flag: "🇩🇪" },
    PAR: { name: "Paraguay",              flag: "🇵🇾" },
    NED: { name: "Netherlands",           flag: "🇳🇱" },
    MAR: { name: "Morocco",               flag: "🇲🇦" },
    BRA: { name: "Brazil",                flag: "🇧🇷" },
    JPN: { name: "Japan",                 flag: "🇯🇵" },
    FRA: { name: "France",                flag: "🇫🇷" },
    SWE: { name: "Sweden",                flag: "🇸🇪" },
    CIV: { name: "Ivory Coast",           flag: "🇨🇮" },
    NOR: { name: "Norway",                flag: "🇳🇴" },
    MEX: { name: "Mexico",                flag: "🇲🇽" },
    ECU: { name: "Ecuador",               flag: "🇪🇨" },
    ENG: { name: "England",               flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
    COD: { name: "DR Congo",              flag: "🇨🇩" },
    USA: { name: "United States",         flag: "🇺🇸" },
    BIH: { name: "Bosnia & Herzegovina",  flag: "🇧🇦" },
    BEL: { name: "Belgium",               flag: "🇧🇪" },
    SEN: { name: "Senegal",               flag: "🇸🇳" },
    POR: { name: "Portugal",              flag: "🇵🇹" },
    CRO: { name: "Croatia",               flag: "🇭🇷" },
    ESP: { name: "Spain",                 flag: "🇪🇸" },
    AUT: { name: "Austria",               flag: "🇦🇹" },
    SUI: { name: "Switzerland",           flag: "🇨🇭" },
    ALG: { name: "Algeria",               flag: "🇩🇿" },
    ARG: { name: "Argentina",             flag: "🇦🇷" },
    CPV: { name: "Cape Verde",            flag: "🇨🇻" },
    COL: { name: "Colombia",              flag: "🇨🇴" },
    GHA: { name: "Ghana",                 flag: "🇬🇭" },
    AUS: { name: "Australia",             flag: "🇦🇺" },
    EGY: { name: "Egypt",                 flag: "🇪🇬" }
  },

  matches: [
    // ---- Round of 32 (match 73-88) ----
    { id: 73, round: "R32", a: { team: "RSA" }, b: { team: "CAN" }, date: "Jun 28", venue: "SoFi Stadium, Inglewood" },
    { id: 74, round: "R32", a: { team: "GER" }, b: { team: "PAR" }, date: "Jun 29", venue: "Gillette Stadium, Foxborough" },
    { id: 75, round: "R32", a: { team: "NED" }, b: { team: "MAR" }, date: "Jun 29", venue: "Estadio BBVA, Guadalupe" },
    { id: 76, round: "R32", a: { team: "BRA" }, b: { team: "JPN" }, date: "Jun 29", venue: "NRG Stadium, Houston" },
    { id: 77, round: "R32", a: { team: "FRA" }, b: { team: "SWE" }, date: "Jun 30", venue: "MetLife Stadium, East Rutherford" },
    { id: 78, round: "R32", a: { team: "CIV" }, b: { team: "NOR" }, date: "Jun 30", venue: "AT&T Stadium, Arlington" },
    { id: 79, round: "R32", a: { team: "MEX" }, b: { team: "ECU" }, date: "Jun 30", venue: "Estadio Azteca, Mexico City" },
    { id: 80, round: "R32", a: { team: "ENG" }, b: { team: "COD" }, date: "Jul 1",  venue: "Mercedes-Benz Stadium, Atlanta" },
    { id: 81, round: "R32", a: { team: "USA" }, b: { team: "BIH" }, date: "Jul 1",  venue: "Levi's Stadium, Santa Clara" },
    { id: 82, round: "R32", a: { team: "BEL" }, b: { team: "SEN" }, date: "Jul 1",  venue: "Lumen Field, Seattle" },
    { id: 83, round: "R32", a: { team: "POR" }, b: { team: "CRO" }, date: "Jul 2",  venue: "BMO Field, Toronto" },
    { id: 84, round: "R32", a: { team: "ESP" }, b: { team: "AUT" }, date: "Jul 2",  venue: "SoFi Stadium, Inglewood" },
    { id: 85, round: "R32", a: { team: "SUI" }, b: { team: "ALG" }, date: "Jul 2",  venue: "BC Place, Vancouver" },
    { id: 86, round: "R32", a: { team: "ARG" }, b: { team: "CPV" }, date: "Jul 3",  venue: "Hard Rock Stadium, Miami Gardens" },
    { id: 87, round: "R32", a: { team: "COL" }, b: { team: "GHA" }, date: "Jul 3",  venue: "Arrowhead Stadium, Kansas City" },
    { id: 88, round: "R32", a: { team: "AUS" }, b: { team: "EGY" }, date: "Jul 3",  venue: "AT&T Stadium, Arlington" },

    // ---- Round of 16 (match 89-96) ----
    { id: 89, round: "R16", a: { win: 74 }, b: { win: 77 }, date: "Jul 4", venue: "Philadelphia" },
    { id: 90, round: "R16", a: { win: 73 }, b: { win: 75 }, date: "Jul 4", venue: "Houston" },
    { id: 91, round: "R16", a: { win: 76 }, b: { win: 78 }, date: "Jul 5", venue: "East Rutherford" },
    { id: 92, round: "R16", a: { win: 79 }, b: { win: 80 }, date: "Jul 5", venue: "Mexico City" },
    { id: 93, round: "R16", a: { win: 83 }, b: { win: 84 }, date: "Jul 6", venue: "Arlington" },
    { id: 94, round: "R16", a: { win: 81 }, b: { win: 82 }, date: "Jul 6", venue: "Seattle" },
    { id: 95, round: "R16", a: { win: 86 }, b: { win: 88 }, date: "Jul 7", venue: "Atlanta" },
    { id: 96, round: "R16", a: { win: 85 }, b: { win: 87 }, date: "Jul 7", venue: "Vancouver" },

    // ---- Quarter-finals (match 97-100) ----
    { id: 97,  round: "QF", a: { win: 89 }, b: { win: 90 }, date: "Jul 9",  venue: "Foxborough" },
    { id: 98,  round: "QF", a: { win: 93 }, b: { win: 94 }, date: "Jul 10", venue: "Inglewood" },
    { id: 99,  round: "QF", a: { win: 91 }, b: { win: 92 }, date: "Jul 11", venue: "Miami Gardens" },
    { id: 100, round: "QF", a: { win: 95 }, b: { win: 96 }, date: "Jul 11", venue: "Kansas City" },

    // ---- Semi-finals (match 101-102) ----
    { id: 101, round: "SF", a: { win: 97 }, b: { win: 98 },  date: "Jul 14", venue: "Arlington" },
    { id: 102, round: "SF", a: { win: 99 }, b: { win: 100 }, date: "Jul 15", venue: "Atlanta" },

    // ---- Final (match 104) ----
    { id: 104, round: "F", a: { win: 101 }, b: { win: 102 }, date: "Jul 19", venue: "MetLife Stadium, East Rutherford" }
  ],

  // matchId -> winning team code. Filled as the tournament progresses.
  results: {}
};
