/*
 * bracket.js — stateless logic for the bracket app. No DOM here.
 *
 * Everything hangs off the global `WC`. Loaded as a classic script so the app
 * works by double-clicking index.html (no build step, no server required).
 */
(function () {
  "use strict";

  var D = window.WC_DATA;
  var CODE_VERSION = 1; // bump if the matches order / encoding layout changes

  // Fast lookups -------------------------------------------------------------
  var MATCHES = D.matches;
  var MATCH_BY_ID = {};
  MATCHES.forEach(function (m) { MATCH_BY_ID[m.id] = m; });
  var ROUND_BY_KEY = {};
  D.rounds.forEach(function (r) { ROUND_BY_KEY[r.key] = r; });

  function team(code) { return code ? D.teams[code] : null; }

  // ---- Resolution ----------------------------------------------------------
  // picks: { matchId: 'a' | 'b' }  (positional: which slot is predicted to win)
  // Returns: { matchId: { a, b, winner } } where a/b/winner are team codes|null.
  function resolve(picks) {
    picks = picks || {};
    var out = {};
    function slot(s) {
      if (!s) return null;
      if (s.team) return s.team;
      if (s.win != null) { var r = out[s.win]; return r ? r.winner : null; }
      return null;
    }
    MATCHES.forEach(function (m) {
      var a = slot(m.a);
      var b = slot(m.b);
      var p = picks[m.id];
      var winner = p === "a" ? a : (p === "b" ? b : null);
      // If a downstream feeder changed and the chosen slot is now empty, drop it.
      if (winner == null) winner = null;
      out[m.id] = { a: a, b: b, winner: winner };
    });
    return out;
  }

  function champion(picks) { return resolve(picks)[104].winner; }

  // ---- Official results (data + cached live feed + local overrides) ---------
  var RESULTS_CACHE_KEY = "wc_results_cache_v1";

  function officialResults() {
    var merged = {};
    var assign = function (obj) { if (obj) Object.keys(obj).forEach(function (k) { merged[k] = obj[k]; }); };
    assign(D.results);
    var cache = readJSON(RESULTS_CACHE_KEY, null);
    if (cache && cache.results) assign(cache.results);
    return merged;
  }

  function resultsUpdatedAt() {
    var cache = readJSON(RESULTS_CACHE_KEY, null);
    return (cache && cache.updated) || D.updated;
  }

  // Store/replace a single official result locally (used by the results editor
  // and by the live-feed importer). winner === null clears it.
  function setOfficialResult(matchId, winner) {
    var cache = readJSON(RESULTS_CACHE_KEY, { updated: D.updated, results: {} });
    if (!cache.results) cache.results = {};
    if (winner == null) delete cache.results[matchId];
    else cache.results[matchId] = winner;
    cache.updated = todayISO();
    writeJSON(RESULTS_CACHE_KEY, cache);
  }

  function mergeOfficialResults(resultsObj, updated) {
    var cache = readJSON(RESULTS_CACHE_KEY, { updated: D.updated, results: {} });
    if (!cache.results) cache.results = {};
    Object.keys(resultsObj || {}).forEach(function (k) {
      if (resultsObj[k] == null) delete cache.results[k];
      else cache.results[k] = resultsObj[k];
    });
    cache.updated = updated || todayISO();
    writeJSON(RESULTS_CACHE_KEY, cache);
  }

  // ---- Live feed --------------------------------------------------------
  // Map team display names (and common API variants) -> our team codes.
  var NAME_TO_CODE = {};
  Object.keys(D.teams).forEach(function (code) { NAME_TO_CODE[normName(D.teams[code].name)] = code; });
  var NAME_ALIASES = {
    usa: "USA", unitedstatesofamerica: "USA",
    cotedivoire: "CIV", ivorycoast: "CIV",
    drcongo: "COD", congodr: "COD", democraticrepublicofthecongo: "COD", congodrc: "COD",
    caboverde: "CPV", capeverde: "CPV",
    bosnia: "BIH", bosniaandherzegovina: "BIH", bosniaherzegovina: "BIH",
    holland: "NED", southkorea: "KOR", czechrepublic: "CZE"
  };
  Object.keys(NAME_ALIASES).forEach(function (k) { if (!NAME_TO_CODE[k]) NAME_TO_CODE[k] = NAME_ALIASES[k]; });

  function normName(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z]/g, ""); }
  function codeFromName(name) { return NAME_TO_CODE[normName(name)] || null; }

  // Convert a list of TheSportsDB events into {matchId: winnerCode}. Only finished
  // knockout games (on/after knockoutFrom) that produced a clear winner are mapped,
  // resolving the bracket progressively so later rounds fill in as earlier ones settle.
  function adaptSportsdb(events, cfg) {
    var from = (cfg && cfg.knockoutFrom) || "";
    var finishedRe = /ft|aet|ap|pen|finished/i;
    var pairWin = {}; // "CODE1|CODE2" (sorted) -> winner code
    (events || []).forEach(function (e) {
      if (from && e.dateEvent && e.dateEvent < from) return;
      var hs = e.intHomeScore, as = e.intAwayScore;
      if (hs == null || hs === "" || as == null || as === "") return;
      var status = e.strStatus || "";
      if (status && !finishedRe.test(status)) return; // skip not-yet-final games
      var h = codeFromName(e.strHomeTeam), a = codeFromName(e.strAwayTeam);
      if (!h || !a) return;
      hs = parseInt(hs, 10); as = parseInt(as, 10);
      var w = hs > as ? h : (as > hs ? a : null); // draw -> undecided here (manual override possible)
      if (!w) return;
      pairWin[[h, a].sort().join("|")] = w;
    });

    var tmp = {}, results = {};
    function slot(s) {
      if (!s) return null;
      if (s.team) return s.team;
      if (s.win != null) { var r = tmp[s.win]; return r ? r.winner : null; }
      return null;
    }
    MATCHES.forEach(function (m) {
      var aw = slot(m.a), bw = slot(m.b), w = null;
      if (aw && bw) {
        var hit = pairWin[[aw, bw].sort().join("|")];
        if (hit && (hit === aw || hit === bw)) { w = hit; results[m.id] = w; }
      }
      tmp[m.id] = { a: aw, b: bw, winner: w };
    });
    return results;
  }

  // Status of the most recent live check this session (for the UI indicator).
  var _lastCheck = null;
  function lastCheck() { return _lastCheck; }
  function feedType() { return (D.feed && D.feed.type) || (D.resultsUrl ? "json" : "none"); }
  function feedActive() { return feedType() !== "none"; }

  // Always-on live results fetch. Resolves to a status object; never throws.
  function fetchResults() {
    return new Promise(function (resolve) {
      var type = feedType();
      if (type === "none") { resolve({ ok: false, reason: "no-feed" }); return; }
      var url, sd = (D.feed && D.feed.sportsdb) || {};
      if (type === "thesportsdb") {
        url = "https://www.thesportsdb.com/api/v1/json/" + (sd.key || "3") +
              "/eventsseason.php?id=" + sd.leagueId + "&s=" + encodeURIComponent(sd.season);
      } else {
        url = D.resultsUrl;
      }
      fetch(url, { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (json) {
          var results, updated;
          if (type === "thesportsdb") { results = adaptSportsdb(json.events || [], sd); updated = todayISO(); }
          else { results = json.results || {}; updated = json.updated; }
          mergeOfficialResults(results, updated);
          _lastCheck = { at: todayISO(), ok: true, count: Object.keys(results).length };
          resolve({ ok: true, count: Object.keys(results).length });
        })
        .catch(function (e) {
          _lastCheck = { at: todayISO(), ok: false, reason: String(e && e.message || e) };
          resolve({ ok: false, reason: String(e && e.message || e) });
        });
    });
  }

  // A match is "locked" for editing once an official result exists for it.
  function isLocked(matchId) { return officialResults()[matchId] != null; }

  // ---- Scoring -------------------------------------------------------------
  // Returns per-match grade + totals for a set of picks vs official results.
  function score(picks) {
    var res = resolve(picks);
    var official = officialResults();
    var perMatch = {};
    var totals = { correct: 0, wrong: 0, graded: 0, pending: 0, points: 0, maxPoints: 0 };
    var byRound = {};
    D.rounds.forEach(function (r) { byRound[r.key] = { correct: 0, graded: 0, points: 0 }; });

    MATCHES.forEach(function (m) {
      var pts = ROUND_BY_KEY[m.round].pts;
      totals.maxPoints += pts;
      var actual = official[m.id];
      var predicted = res[m.id].winner;
      var grade = "pending";
      if (actual != null) {
        totals.graded++;
        byRound[m.round].graded++;
        if (predicted && predicted === actual) {
          grade = "correct";
          totals.correct++; totals.points += pts;
          byRound[m.round].correct++; byRound[m.round].points += pts;
        } else {
          grade = "wrong";
          totals.wrong++;
        }
      } else {
        totals.pending++;
      }
      perMatch[m.id] = { grade: grade, predicted: predicted, actual: actual, pts: pts };
    });
    totals.byRound = byRound;
    return { perMatch: perMatch, totals: totals };
  }

  function isComplete(picks) {
    return MATCHES.every(function (m) { return picks && (picks[m.id] === "a" || picks[m.id] === "b"); });
  }
  function pickCount(picks) {
    return MATCHES.reduce(function (n, m) { return n + (picks && picks[m.id] ? 1 : 0); }, 0);
  }

  // ---- Compact encoding ----------------------------------------------------
  // 2 bits per match in canonical order: 0=unset, 1=slot A, 2=slot B.
  // Prepend a 1-byte version, base64url the bytes. ~12 chars for a full bracket.
  function encodePicks(picks) {
    var n = MATCHES.length;
    var bytes = new Uint8Array(1 + Math.ceil((n * 2) / 8));
    bytes[0] = CODE_VERSION;
    for (var i = 0; i < n; i++) {
      var p = picks[MATCHES[i].id];
      var v = p === "a" ? 1 : (p === "b" ? 2 : 0);
      var bit = i * 2;
      var byteIdx = 1 + (bit >> 3);
      var shift = bit & 7;
      bytes[byteIdx] |= (v << shift);
    }
    return bytesToB64url(bytes);
  }

  function decodePicks(code) {
    var bytes = b64urlToBytes(code);
    if (!bytes || bytes.length < 1 || bytes[0] !== CODE_VERSION) return null;
    var picks = {};
    for (var i = 0; i < MATCHES.length; i++) {
      var bit = i * 2;
      var byteIdx = 1 + (bit >> 3);
      var shift = bit & 7;
      if (byteIdx >= bytes.length) break;
      var v = (bytes[byteIdx] >> shift) & 3;
      if (v === 1) picks[MATCHES[i].id] = "a";
      else if (v === 2) picks[MATCHES[i].id] = "b";
    }
    return picks;
  }

  function bytesToB64url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToBytes(s) {
    try {
      s = String(s).replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      var bin = atob(s);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch (e) { return null; }
  }

  // ---- Share link ----------------------------------------------------------
  // Everything needed to reconstruct a bracket lives in the URL hash.
  function buildShareUrl(bracket) {
    var base = location.origin + location.pathname;
    // The bracket name always travels with the link so the recipient sees what
    // it's called. Falls back to a default if the bracket was never named.
    var name = trimName((bracket.name && bracket.name.trim()) || "My World Cup bracket");
    return base + "#b=" + encodePicks(bracket.picks) + "&n=" + encodeURIComponent(name);
  }

  function parseShareHash(hash) {
    hash = (hash || location.hash || "").replace(/^#/, "");
    if (!hash) return null;
    var params = {};
    hash.split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i === -1) return;
      params[kv.slice(0, i)] = kv.slice(i + 1);
    });
    if (!params.b) return null;
    var picks = decodePicks(params.b);
    if (!picks) return null;
    return { picks: picks, name: params.n ? decodeURIComponent(params.n) : "" };
  }

  // The plain-text message used for messaging-app shares.
  function shareMessage(url, name, championName) {
    return "🏆 " + (name || "My World Cup 2026 bracket") +
           (championName ? " — I've got " + championName + " lifting the trophy!" : "") +
           " Make your knockout predictions: " + url;
  }

  // Social channels. WhatsApp/Telegram are marked mobileOnly — on desktop they
  // open web pages rather than apps, so callers hide them there.
  function shareChannels(url, name, championName, mobile) {
    var msg = "🏆 " + (name || "My World Cup 2026 bracket") +
              (championName ? " — I've got " + championName + " lifting the trophy!" : "") +
              " Make your knockout predictions:";
    var u = encodeURIComponent(url);
    var t = encodeURIComponent(msg);
    var tPlusU = encodeURIComponent(msg + " " + url);
    var all = [
      { key: "whatsapp", label: "WhatsApp", mobileOnly: true, href: "https://wa.me/?text=" + tPlusU },
      { key: "telegram", label: "Telegram", mobileOnly: true, href: "https://t.me/share/url?url=" + u + "&text=" + t },
      { key: "twitter",  label: "X / Twitter", href: "https://twitter.com/intent/tweet?text=" + t + "&url=" + u },
      { key: "facebook", label: "Facebook", href: "https://www.facebook.com/sharer/sharer.php?u=" + u },
      { key: "reddit",   label: "Reddit", href: "https://www.reddit.com/submit?url=" + u + "&title=" + t },
      { key: "email",    label: "Email", href: "mailto:?subject=" + encodeURIComponent((name || "My World Cup bracket")) + "&body=" + tPlusU }
    ];
    return all.filter(function (c) { return mobile || !c.mobileOnly; });
  }

  // ---- Saved brackets (localStorage) ---------------------------------------
  var STORE_KEY = "wc_brackets_v1";

  function loadBrackets() { return readJSON(STORE_KEY, []); }
  function saveAllBrackets(list) { writeJSON(STORE_KEY, list); }

  function picksSignature(picks) {
    return MATCHES.map(function (m) { return picks[m.id] === "a" ? "1" : picks[m.id] === "b" ? "2" : "0"; }).join("");
  }

  // Insert or update a bracket. Returns the stored record.
  function upsertBracket(bracket) {
    var list = loadBrackets();
    var rec;
    if (bracket.id) {
      var idx = findIndex(list, function (b) { return b.id === bracket.id; });
      if (idx !== -1) {
        rec = list[idx];
        rec.name = bracket.name;
        rec.picks = bracket.picks;
        rec.mine = bracket.mine !== undefined ? bracket.mine : rec.mine;
        rec.updatedAt = todayISO();
        saveAllBrackets(list);
        return rec;
      }
    }
    rec = {
      id: bracket.id || genId(),
      name: bracket.name || "Untitled bracket",
      picks: bracket.picks || {},
      mine: bracket.mine !== false,
      createdAt: todayISO(),
      updatedAt: todayISO()
    };
    list.push(rec);
    saveAllBrackets(list);
    return rec;
  }

  // Save an incoming (friend's) bracket, de-duping identical ones.
  function importBracket(name, picks) {
    var list = loadBrackets();
    var sig = picksSignature(picks);
    var existing = find(list, function (b) { return picksSignature(b.picks) === sig && (b.name || "") === (name || ""); });
    if (existing) return { record: existing, duplicate: true };
    var rec = upsertBracket({ name: name || "Friend's bracket", picks: picks, mine: false });
    return { record: rec, duplicate: false };
  }

  function getBracket(id) { return find(loadBrackets(), function (b) { return b.id === id; }); }
  function deleteBracket(id) {
    saveAllBrackets(loadBrackets().filter(function (b) { return b.id !== id; }));
  }

  // ---- small utils ---------------------------------------------------------
  function readJSON(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function genId() {
    return "b" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }
  function todayISO() { return new Date().toISOString(); }
  function trimName(n) { return String(n || "").slice(0, 40); }
  function find(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return arr[i]; return null; }
  function findIndex(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return i; return -1; }

  // ---- public API ----------------------------------------------------------
  window.WC = {
    data: D,
    MATCHES: MATCHES,
    matchById: function (id) { return MATCH_BY_ID[id]; },
    round: function (key) { return ROUND_BY_KEY[key]; },
    team: team,
    resolve: resolve,
    champion: champion,
    score: score,
    isComplete: isComplete,
    pickCount: pickCount,
    encodePicks: encodePicks,
    decodePicks: decodePicks,
    buildShareUrl: buildShareUrl,
    parseShareHash: parseShareHash,
    shareChannels: shareChannels,
    shareMessage: shareMessage,
    loadBrackets: loadBrackets,
    upsertBracket: upsertBracket,
    importBracket: importBracket,
    getBracket: getBracket,
    deleteBracket: deleteBracket,
    picksSignature: picksSignature,
    officialResults: officialResults,
    resultsUpdatedAt: resultsUpdatedAt,
    setOfficialResult: setOfficialResult,
    mergeOfficialResults: mergeOfficialResults,
    fetchResults: fetchResults,
    lastCheck: lastCheck,
    feedType: feedType,
    feedActive: feedActive,
    isLocked: isLocked,
    trimName: trimName
  };
})();
