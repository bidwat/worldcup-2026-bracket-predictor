/*
 * app.js — UI + interaction for the World Cup 2026 Bracket Predictor.
 * Pure DOM, no framework. Depends on globals WC_DATA (data.js) and WC (bracket.js).
 */
(function () {
  "use strict";

  var APP = document.getElementById("app");
  var MODAL_HOST = document.getElementById("modalHost");
  var MODAL_CARD = document.getElementById("modalCard");
  var TOAST_HOST = document.getElementById("toastHost");

  // -- Bracket layout geometry (connector-based tournament tree) --------------
  var CARD_W = 206, COL_GAP = 80, ROW_UNIT = 100, CARD_H = 92, PAD = 8;

  var ROUND_INDEX = {};
  WC_DATA.rounds.forEach(function (r, i) { ROUND_INDEX[r.key] = i; });

  // Vertical position of each match: leaves get sequential rows in tree order,
  // every parent sits centred between its two children. Match-id order is
  // irrelevant — this is what makes "who advances where" read cleanly.
  var ROW_OF = {};
  (function () {
    var n = 0;
    (function rec(id) {
      var m = WC.matchById(id), kids = [];
      ["a", "b"].forEach(function (s) { if (m[s].win != null) kids.push(m[s].win); });
      if (!kids.length) { ROW_OF[id] = n++; return ROW_OF[id]; }
      var cr = kids.map(rec);
      ROW_OF[id] = (Math.min.apply(null, cr) + Math.max.apply(null, cr)) / 2;
      return ROW_OF[id];
    })(104);
  })();

  var MAX_ROW = Object.keys(ROW_OF).reduce(function (mx, k) { return Math.max(mx, ROW_OF[k]); }, 0);

  // Ordinal of each match within its round, numbered top-to-bottom by position.
  var ORD = {};
  WC_DATA.rounds.forEach(function (r) {
    WC.MATCHES.filter(function (m) { return m.round === r.key; })
      .slice().sort(function (a, b) { return ROW_OF[a.id] - ROW_OF[b.id]; })
      .forEach(function (m, i) { ORD[m.id] = i + 1; });
  });

  var ROUND_SHORT = { R32: "Round-of-32 game", R16: "Last-16 game", QF: "Quarter-final", SF: "Semi-final", F: "Final" };

  // Forward-adjacency: which match consumes each match's winner.
  var PARENT = {};
  WC.MATCHES.forEach(function (m) {
    ["a", "b"].forEach(function (s) { if (m[s].win != null) PARENT[m[s].win] = m.id; });
  });

  var state = { view: "home", editing: null, ro: null, dirty: false };

  // ------------------------------------------------------------ analytics (GA4)
  // No script loads and no events fire unless a Measurement ID is configured.
  function initAnalytics() {
    var id = ((WC_DATA.analytics && WC_DATA.analytics.ga4Id) || "").trim();
    if (!id) return;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id); // fires the initial page_view = a site open
  }
  function track(name, params) {
    try { if (window.gtag) window.gtag("event", name, params || {}); } catch (e) {}
  }

  // ------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ic(cls) { return '<i class="' + cls + '"></i>'; }
  function isMobile() { return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent || ""); }
  function flagSpan(code) { var t = WC.team(code); return '<span class="flag">' + (t ? t.flag : "🏳️") + "</span>"; }
  function teamName(code) { var t = WC.team(code); return t ? t.name : ""; }

  function toast(msg, type) {
    var el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.innerHTML = (type === "good" ? ic("fa-solid fa-circle-check") : type === "bad" ? ic("fa-solid fa-circle-exclamation") : "") + "<span>" + esc(msg) + "</span>";
    TOAST_HOST.appendChild(el);
    setTimeout(function () { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 2000);
    setTimeout(function () { el.remove(); }, 2400);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText)
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (e) { return false; }
  }

  function openModal(html) { MODAL_CARD.innerHTML = html; MODAL_HOST.hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal() { MODAL_HOST.hidden = true; MODAL_CARD.innerHTML = ""; document.body.style.overflow = ""; }
  MODAL_HOST.addEventListener("click", function (e) {
    if (e.target.dataset.close || e.target.closest(".close-x")) { closeModal(); render(); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !MODAL_HOST.hidden) { closeModal(); render(); } });

  // ------------------------------------------------------------ theme
  function currentTheme() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function syncThemeIcon() {
    var b = document.getElementById("themeToggle");
    if (b) b.innerHTML = currentTheme() === "light" ? ic("fa-solid fa-sun") : ic("fa-solid fa-moon");
  }
  document.getElementById("themeToggle").addEventListener("click", function () {
    var next = currentTheme() === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("wc_theme", next); } catch (e) {}
    syncThemeIcon();
  });

  // ------------------------------------------------------------ nav
  document.querySelectorAll(".nav-btn[data-view]").forEach(function (b) {
    b.addEventListener("click", function () { go(b.dataset.view); });
  });
  document.getElementById("newBracketBtn").addEventListener("click", function () { openEditor(null); });
  document.getElementById("navHome").addEventListener("click", function () { go("home"); });

  function go(view) { state.view = view; state.editing = null; state.ro = null; render(); }
  function setNavActive() {
    document.querySelectorAll(".nav-btn[data-view]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === state.view);
    });
  }

  // ------------------------------------------------------------ data strip + footer
  function renderDataStrip() {
    var strip = document.getElementById("dataStrip");
    var played = Object.keys(WC.officialResults()).length;
    strip.innerHTML =
      '<span class="pill">' + ic("fa-solid fa-sitemap") + " Knockout stage · 32 teams</span>" +
      '<span class="pill">' + ic("fa-solid fa-futbol") + " " + played + " / " + WC.MATCHES.length + " matches resolved</span>" +
      '<button id="refreshFeed" type="button">' + ic("fa-solid fa-rotate") + " Refresh results</button>" +
      '<button id="enterResults" type="button">' + ic("fa-solid fa-pen-to-square") + " Enter results</button>";
    strip.querySelector("#refreshFeed").addEventListener("click", refreshFeed);
    strip.querySelector("#enterResults").addEventListener("click", openResultsEditor);
  }
  function renderFooter() {
    var f = document.getElementById("footUpdated");
    if (f) f.textContent = "Updated " + prettyDate(WC.resultsUpdatedAt());
  }
  function prettyDate(iso) {
    try { var d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return String(iso); }
  }

  function refreshFeed() {
    if (!WC.feedActive()) { toast("No live feed configured — use Enter results.", "bad"); return; }
    toast("Checking live results…");
    WC.fetchResults().then(function (r) {
      renderDataStrip(); renderFooter();
      if (r.ok) { toast(r.count + " result(s) live · scores updated.", "good"); render(); }
      else toast("Couldn’t reach the live feed.", "bad");
    });
  }

  // ============================================================== RENDER
  function render() {
    closePopover();
    setNavActive(); renderDataStrip(); renderFooter(); syncThemeIcon();
    if (state.view === "editor") renderEditor();
    else if (state.view === "readonly") renderReadonly();
    else if (state.view === "compare") renderCompare();
    else renderHome();
    window.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------------ shared board
  function X(id) { return PAD + ROUND_INDEX[WC.matchById(id).round] * (CARD_W + COL_GAP); }
  function Y(id) { return PAD + ROW_OF[id] * ROW_UNIT; }

  function slotLabel(m, side, resolved) {
    var s = m[side];
    if (s.team) return teamName(s.team);
    var childId = s.win, child = resolved[childId], cm = WC.matchById(childId);
    if (child && child.a && child.b) return teamName(child.a) + " vs. " + teamName(child.b) + " winner";
    return ROUND_SHORT[cm.round] + " " + ORD[childId] + " winner";
  }

  function boardHtml(resolved, scored, mode) {
    var width = PAD * 2 + 4 * (CARD_W + COL_GAP) + CARD_W;
    var height = PAD * 2 + MAX_ROW * ROW_UNIT + CARD_H;

    var lines = "";
    WC.MATCHES.forEach(function (m) {
      ["a", "b"].forEach(function (side) {
        if (m[side].win == null) return;
        var c = m[side].win;
        var x1 = X(c) + CARD_W, y1 = Y(c) + CARD_H / 2;
        var x2 = X(m.id), y2 = Y(m.id) + CARD_H / 2;
        var midx = (x1 + x2) / 2;
        lines += '<path d="M' + x1 + " " + y1 + " H" + midx + " V" + y2 + " H" + x2 + '"/>';
      });
    });

    var heads = WC_DATA.rounds.map(function (r, i) {
      var x = PAD + i * (CARD_W + COL_GAP);
      return '<div class="bhead" style="left:' + x + "px;width:" + CARD_W + 'px">' + esc(r.name) +
        ' <span class="pts">' + r.pts + " pt" + (r.pts > 1 ? "s" : "") + "</span></div>";
    }).join("");

    var cards = WC.MATCHES.map(function (m) {
      var cue = isFinalCue(m, resolved, mode) ? " final-cue" : "";
      return '<div class="bmatch' + cue + '" style="left:' + X(m.id) + "px;top:" + Y(m.id) + "px;width:" + CARD_W + 'px">' +
        matchInner(m, resolved, scored, mode) + "</div>";
    }).join("");

    return '<div class="board-scroll">' +
      '<div class="board-heads" style="width:' + width + 'px">' + heads + "</div>" +
      '<div class="board" style="width:' + width + "px;height:" + height + 'px">' +
      '<svg class="bracket-lines" width="' + width + '" height="' + height + '">' + lines + "</svg>" +
      cards + "</div></div>";
  }

  // The final, once both finalists are set but no winner is picked yet.
  function isFinalCue(m, resolved, mode) {
    if (mode !== "edit" || m.id !== 104) return false;
    var rm = resolved[104];
    return !!(rm && rm.a && rm.b) && !pickSource()[104];
  }

  function matchInner(m, resolved, scored, mode) {
    var locked = WC.isLocked(m.id);
    var cue = isFinalCue(m, resolved, mode)
      ? '<div class="final-cue-tip">' + ic("fa-solid fa-hand-pointer") + " Tap your champion</div>" : "";
    return cue + '<div class="bm-head"><span>' + esc(m.date) + "</span>" +
      (locked ? '<span class="ft">FT</span>' : "<span></span>") + "</div>" +
      slotBtn(m, "a", resolved, scored, locked, mode) +
      slotBtn(m, "b", resolved, scored, locked, mode);
  }

  function slotBtn(m, side, resolved, scored, locked, mode) {
    var rm = resolved[m.id], code = rm[side];
    var picks = pickSource();
    var chosen = picks[m.id] === side;
    var grade = scored.perMatch[m.id];
    var classes = ["bslot"];
    var mk = "";

    if (!code) classes.push("tbd");
    if (chosen) classes.push("chosen");

    var isChamp = m.id === 104 && chosen; // the predicted champion
    var trophy = '<span class="champ-trophy">' + ic("fa-solid fa-trophy") + "</span>";

    if (grade.actual != null && code) {
      var actualWinner = code === grade.actual;
      if (chosen) {
        if (actualWinner) { classes = ["bslot", "correct"]; mk = isChamp ? trophy : ic("fa-solid fa-check"); if (isChamp) classes.push("champion"); }
        else { classes = ["bslot", "wrong"]; mk = ic("fa-solid fa-xmark"); }
      } else if (actualWinner) { classes = ["bslot", "advanced"]; mk = "through"; }
      else { classes.push("elim"); }
    } else if (chosen) {
      if (isChamp) { classes.push("champion"); mk = trophy; }
      else mk = ic("fa-solid fa-circle-check");
    }

    var editable = mode === "edit" && code && !locked;

    // A still-undecided slot ("X vs. Y winner") becomes selectable once its
    // feeder match has both participants — i.e. the previous round is filled.
    // Clicking it opens a two-flag popover to choose who advances.
    var tbdChild = null;
    if (!code && mode === "edit" && m[side].win != null) {
      var cr = resolved[m[side].win];
      if (cr && cr.a && cr.b) tbdChild = m[side].win;
    }

    if (editable) classes.push("pickable");
    if (tbdChild != null) { classes.push("pickable", "tbd-pick"); mk = ic("fa-solid fa-circle-chevron-down"); }

    var fullLabel = code ? teamName(code) : slotLabel(m, side, resolved);
    var label = esc(fullLabel);
    var enabled = editable || tbdChild != null;
    return '<button class="' + classes.join(" ") + '" data-side="' + side + '" data-mid="' + m.id + '"' +
      (tbdChild != null ? ' data-tbd="1" data-child="' + tbdChild + '"' : "") +
      ' title="' + label + '"' + (enabled ? "" : " disabled") + ">" +
      (code ? flagSpan(code) : '<span class="flag">·</span>') +
      '<span class="nm">' + label + "</span>" +
      '<span class="mk">' + mk + "</span></button>";
  }

  // The active picks map depends on what we're rendering.
  function pickSource() {
    if (state.view === "editor" && state.editing) return state.editing.picks;
    if (state.view === "readonly" && state.ro) return state.ro.picks;
    return {};
  }

  function winnerChip(picks, label) {
    var champ = WC.champion(picks);
    if (!champ) return "";
    var grade = WC.score(picks).perMatch[104].grade;
    var cls = grade === "correct" ? " good" : grade === "wrong" ? " bad" : "";
    return '<span class="winner-chip' + cls + '"><span class="ico">' + ic("fa-solid fa-trophy") + "</span>" +
      (label || "Predicted winner") + ": " + flagSpan(champ) + " <b>" + esc(teamName(champ)) + "</b></span>";
  }

  function statsRow(picks) {
    var s = WC.score(picks);
    if (!s.totals.graded) return "";
    return '<span class="stat primary" style="min-width:84px"><div class="v">' + s.totals.points + '</div><div class="k">points</div></span>' +
      '<span class="stat good" style="min-width:84px"><div class="v">' + s.totals.correct + '</div><div class="k">correct</div></span>' +
      '<span class="stat" style="min-width:84px"><div class="v">' + s.totals.graded + "/" + WC.MATCHES.length + '</div><div class="k">resolved</div></span>';
  }

  // ------------------------------------------------------------ HOME
  function renderHome() {
    var list = WC.loadBrackets();
    var head = '<div class="section-head"><div><h1>My Brackets</h1>' +
      '<p>Your predictions and the ones friends shared with you.</p></div><div class="spacer"></div>' +
      (list.length ? '<button class="btn ghost" id="homeCompare" type="button">' + ic("fa-solid fa-ranking-star") + " Compare all</button>" : "") +
      '<button class="btn primary" id="homeNew" type="button">' + ic("fa-solid fa-plus") + " New bracket</button></div>";

    if (!list.length) {
      APP.innerHTML = head +
        '<div class="empty"><div class="big">' + ic("fa-solid fa-trophy") + ic("fa-solid fa-futbol") + "</div>" +
        "<h2>No brackets yet</h2><p>Build your World Cup 2026 knockout bracket — pick every winner from the Round of 32 to the final — then share a link so friends can play along.</p>" +
        '<button class="btn primary" id="emptyNew" type="button">' + ic("fa-solid fa-plus") + " Create your first bracket</button></div>";
      APP.querySelector("#homeNew").addEventListener("click", function () { openEditor(null); });
      APP.querySelector("#emptyNew").addEventListener("click", function () { openEditor(null); });
      return;
    }

    list.sort(function (a, b) {
      if (!!b.mine !== !!a.mine) return a.mine ? -1 : 1;
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
    APP.innerHTML = head + '<div class="cards">' + list.map(homeCard).join("") + "</div>";

    APP.querySelector("#homeNew").addEventListener("click", function () { openEditor(null); });
    var cmp = APP.querySelector("#homeCompare");
    if (cmp) cmp.addEventListener("click", function () { go("compare"); });
    APP.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function () { cardAction(btn.dataset.act, btn.dataset.id); });
    });
  }

  function homeCard(b) {
    var s = WC.score(b.picks);
    var champ = WC.champion(b.picks);
    var champGrade = s.perMatch[104].grade;
    var made = WC.pickCount(b.picks);
    var pct = Math.round((made / WC.MATCHES.length) * 100);

    var pred = champ
      ? '<div class="pred' + (champGrade === "correct" ? " good" : champGrade === "wrong" ? " bad" : "") + '">' +
          '<span class="ico">' + ic("fa-solid fa-trophy") + "</span>Predicted winner: " + flagSpan(champ) +
          ' <span class="nm"><b>' + esc(teamName(champ)) + "</b></span></div>"
      : '<div class="pred muted">' + ic("fa-solid fa-list-check") + " " + made + "/" + WC.MATCHES.length + " picks · not finished</div>";

    return '<div class="bcard ' + (b.mine ? "mine" : "") + '">' +
      '<div class="bcard-top"><span class="bcard-name">' + esc(b.name) + "</span><span class=\"spacer\"></span>" +
      '<span class="tag ' + (b.mine ? "mine" : "friend") + '">' + (b.mine ? "You" : "Friend") + "</span></div>" +
      pred +
      '<div class="scoreline">' +
        '<div class="stat primary"><div class="v">' + s.totals.points + '</div><div class="k">points</div></div>' +
        '<div class="stat good"><div class="v">' + s.totals.correct + '</div><div class="k">correct</div></div>' +
        '<div class="stat"><div class="v">' + s.totals.graded + '</div><div class="k">resolved</div></div></div>' +
      '<div class="progressbar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="bcard-actions">' +
        '<button class="btn tiny" data-act="open" data-id="' + b.id + '">' + ic(b.mine ? "fa-solid fa-pen" : "fa-solid fa-eye") + " " + (b.mine ? "Open" : "View") + "</button>" +
        '<button class="btn tiny" data-act="share" data-id="' + b.id + '">' + ic("fa-solid fa-share-nodes") + " Share</button>" +
        (b.mine ? "" : '<button class="btn tiny" data-act="copy" data-id="' + b.id + '">' + ic("fa-solid fa-copy") + " Copy</button>") +
        '<button class="btn tiny danger" data-act="delete" data-id="' + b.id + '" aria-label="Delete">' + ic("fa-solid fa-trash") + "</button>" +
      "</div></div>";
  }

  function cardAction(act, id) {
    var rec = WC.getBracket(id);
    if (!rec) return;
    if (act === "open") { rec.mine ? openEditor(rec) : openReadonly({ id: rec.id, name: rec.name, picks: rec.picks, mine: false, incoming: false }); }
    else if (act === "share") openShareModal(rec);
    else if (act === "copy") {
      var copy = WC.upsertBracket({ name: rec.name + " (my copy)", picks: Object.assign({}, rec.picks), mine: true });
      track("bracket_created", { source: "copy", complete: WC.isComplete(copy.picks), picks: WC.pickCount(copy.picks) });
      toast("Copied to your brackets — now editable.", "good");
      openEditor(copy);
    } else if (act === "delete") {
      openModal(
        '<button class="close-x" aria-label="Close">' + ic("fa-solid fa-xmark") + "</button>" +
        "<h3>Delete bracket?</h3><p class=\"sub\">“" + esc(rec.name) + "” will be removed from this browser. This can’t be undone.</p>" +
        '<div class="modal-actions"><button class="btn ghost" data-close="1" type="button">Cancel</button>' +
        '<button class="btn danger" id="confirmDel" type="button">' + ic("fa-solid fa-trash") + " Delete</button></div>"
      );
      MODAL_CARD.querySelector("#confirmDel").addEventListener("click", function () {
        WC.deleteBracket(id); closeModal(); toast("Deleted."); render();
      });
    }
  }

  // ------------------------------------------------------------ EDITOR
  function openEditor(rec) {
    state.editing = rec
      ? { id: rec.id, name: rec.name, picks: Object.assign({}, rec.picks), mine: true }
      : { id: null, name: "", picks: {}, mine: true };
    state.ro = null; state.dirty = false; state.view = "editor";
    render();
  }

  function pick(matchId, side) {
    if (WC.isLocked(matchId)) return;
    var picks = state.editing.picks;
    var before = WC.resolve(picks)[matchId].winner;
    picks[matchId] = side;
    var after = WC.resolve(picks)[matchId].winner;
    if (before && before !== after) { var cur = PARENT[matchId]; while (cur != null) { delete picks[cur]; cur = PARENT[cur]; } }
    state.dirty = true;
    renderEditor();
  }

  function renderEditor() {
    var b = state.editing, picks = b.picks;
    var resolved = WC.resolve(picks), scored = WC.score(picks);
    var made = WC.pickCount(picks), complete = WC.isComplete(picks);

    var head = '<div class="editor-head">' +
      '<input class="name-input" id="bracketName" maxlength="40" placeholder="Name your bracket…" value="' + esc(b.name) + '" />' +
      '<div class="editor-tools">' +
        '<button class="btn ghost tiny" id="randomFill" type="button">' + ic("fa-solid fa-shuffle") + " Randomize</button>" +
        '<button class="btn ghost tiny" id="clearAll" type="button">' + ic("fa-solid fa-eraser") + " Clear</button>" +
        '<button class="btn ghost tiny" id="backBtn" type="button">' + ic("fa-solid fa-arrow-left") + " Back</button>" +
      "</div></div>";

    var sub = (winnerChip(picks) || statsRow(picks))
      ? '<div class="subbar">' + winnerChip(picks) + statsRow(picks) + "</div>" : "";

    var savebar = '<div class="savebar">' +
      '<button class="btn primary" id="saveBtn" type="button">' + ic("fa-solid fa-floppy-disk") + " Save bracket</button>" +
      '<button class="btn" id="shareBtn" type="button">' + ic("fa-solid fa-share-nodes") + " Save &amp; share</button>" +
      '<span class="hint">' + made + "/" + WC.MATCHES.length + " picks" + (complete ? " · complete" : "") + (state.dirty ? " · unsaved" : "") + "</span></div>";

    // Picking re-renders the board; preserve the horizontal scroll position so
    // the bracket doesn't jump back to the start (notably on mobile).
    var prevScroll = APP.querySelector(".board-scroll");
    prevScroll = prevScroll ? { left: prevScroll.scrollLeft, top: prevScroll.scrollTop } : null;

    APP.innerHTML = head + sub + boardHtml(resolved, scored, "edit") + savebar;
    bindBoard("edit");

    if (prevScroll) {
      var sc = APP.querySelector(".board-scroll");
      if (sc) { sc.scrollLeft = prevScroll.left; sc.scrollTop = prevScroll.top; }
    }

    var nameEl = APP.querySelector("#bracketName");
    nameEl.addEventListener("input", function () { state.editing.name = nameEl.value; state.dirty = true; });
    APP.querySelector("#backBtn").addEventListener("click", function () { maybeLeave(function () { go("home"); }); });
    APP.querySelector("#clearAll").addEventListener("click", function () { state.editing.picks = {}; state.dirty = true; renderEditor(); });
    APP.querySelector("#randomFill").addEventListener("click", randomize);
    APP.querySelector("#saveBtn").addEventListener("click", function () { saveCurrent(true); });
    APP.querySelector("#shareBtn").addEventListener("click", shareFlow);
  }

  // Saving & sharing requires a name — prompt for one if it's still blank.
  function shareFlow() {
    var name = (state.editing.name || "").trim();
    if (name) { openShareModal(saveCurrent(false)); return; }
    promptName(function (chosen) {
      state.editing.name = chosen;
      var nameEl = APP.querySelector("#bracketName");
      if (nameEl) nameEl.value = chosen;
      openShareModal(saveCurrent(false));
    });
  }

  function promptName(onName) {
    openModal(
      '<button class="close-x" aria-label="Close">' + ic("fa-solid fa-xmark") + "</button>" +
      "<h3>Name your bracket</h3>" +
      '<p class="sub">Give it a name so friends know whose picks they’re looking at.</p>' +
      '<div class="urlbox"><input id="nameField" maxlength="40" placeholder="e.g. Sam’s Picks" /></div>' +
      '<div class="modal-actions"><button class="btn ghost" data-close="1" type="button">Cancel</button>' +
      '<button class="btn primary" id="nameGo" type="button">' + ic("fa-solid fa-share-nodes") + " Save &amp; share</button></div>"
    );
    var inp = MODAL_CARD.querySelector("#nameField");
    inp.focus();
    function submit() {
      var v = (inp.value || "").trim();
      if (!v) { inp.style.borderColor = "var(--bad)"; inp.focus(); toast("Please enter a name.", "bad"); return; }
      closeModal();
      onName(WC.trimName(v));
    }
    MODAL_CARD.querySelector("#nameGo").addEventListener("click", submit);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  }

  function bindBoard(mode) {
    if (mode !== "edit") return;
    APP.querySelectorAll(".bslot.pickable").forEach(function (sEl) {
      sEl.addEventListener("click", function () {
        if (sEl.dataset.tbd === "1") {
          var childId = parseInt(sEl.dataset.child, 10);
          var cr = WC.resolve(state.editing.picks)[childId];
          openPickPopover(sEl, childId, [{ side: "a", code: cr.a }, { side: "b", code: cr.b }]);
        } else {
          pick(parseInt(sEl.dataset.mid, 10), sEl.dataset.side);
        }
      });
    });
  }

  // Floating two-flag chooser for an undecided slot.
  var _popEl = null, _popOutside = null, _popEsc = null;
  function closePopover() {
    if (_popEl) { _popEl.remove(); _popEl = null; }
    if (_popOutside) { document.removeEventListener("click", _popOutside, true); _popOutside = null; }
    if (_popEsc) { document.removeEventListener("keydown", _popEsc); _popEsc = null; }
  }
  function openPickPopover(anchorEl, childId, opts) {
    closePopover();
    var pop = document.createElement("div");
    pop.className = "pick-pop";
    pop.innerHTML = '<div class="pick-pop-title">Who advances?</div>' +
      opts.map(function (o) {
        return '<button class="pick-pop-opt" type="button" data-side="' + o.side + '">' +
          flagSpan(o.code) + "<span>" + esc(teamName(o.code)) + "</span></button>";
      }).join("");
    document.body.appendChild(pop);
    _popEl = pop;

    var r = anchorEl.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = left + "px";
    pop.style.top = top + "px";

    pop.querySelectorAll(".pick-pop-opt").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var side = b.dataset.side;
        closePopover();
        pick(childId, side);
      });
    });
    _popOutside = function (e) { if (_popEl && !_popEl.contains(e.target)) closePopover(); };
    _popEsc = function (e) { if (e.key === "Escape") closePopover(); };
    setTimeout(function () {
      document.addEventListener("click", _popOutside, true);
      document.addEventListener("keydown", _popEsc);
    }, 0);
  }

  function randomize() {
    var picks = state.editing.picks;
    WC.MATCHES.forEach(function (m) { if (!WC.isLocked(m.id)) picks[m.id] = Math.random() < 0.5 ? "a" : "b"; });
    state.dirty = true; renderEditor(); toast("Randomized — tweak away!");
  }

  function saveCurrent(notify) {
    var b = state.editing;
    var isNew = !b.id;
    if (!b.name || !b.name.trim()) { b.name = "My bracket"; var n = APP.querySelector("#bracketName"); if (n) n.value = b.name; }
    var rec = WC.upsertBracket({ id: b.id, name: WC.trimName(b.name.trim()), picks: b.picks, mine: true });
    state.editing.id = rec.id; state.dirty = false;
    if (isNew) track("bracket_created", { source: "editor", complete: WC.isComplete(b.picks), picks: WC.pickCount(b.picks) });
    if (notify) { toast("Saved to this browser.", "good"); renderEditor(); }
    return rec;
  }

  function maybeLeave(fn) {
    if (!state.dirty) { fn(); return; }
    openModal(
      '<button class="close-x" aria-label="Close">' + ic("fa-solid fa-xmark") + "</button>" +
      "<h3>Leave without saving?</h3><p class=\"sub\">You have unsaved changes to this bracket.</p>" +
      '<div class="modal-actions"><button class="btn" id="saveLeave" type="button">Save &amp; leave</button>' +
      '<button class="btn ghost" id="discardLeave" type="button">Discard</button></div>'
    );
    MODAL_CARD.querySelector("#saveLeave").addEventListener("click", function () { saveCurrent(false); closeModal(); fn(); });
    MODAL_CARD.querySelector("#discardLeave").addEventListener("click", function () { state.dirty = false; closeModal(); fn(); });
  }

  // ------------------------------------------------------------ READ-ONLY VIEW
  // Used for a friend's saved bracket and for an incoming shared link.
  function openReadonly(ro) { state.ro = ro; state.editing = null; state.view = "readonly"; render(); }

  function renderReadonly() {
    var ro = state.ro, picks = ro.picks;
    var resolved = WC.resolve(picks), scored = WC.score(picks);
    var incoming = !!ro.incoming;

    var head = '<div class="editor-head"><h1>' + esc(ro.name || "Shared bracket") + "</h1>" +
      '<span class="tag ' + (incoming ? "friend" : ro.mine ? "mine" : "friend") + '">' +
        (incoming ? "Shared with you · read-only" : "Friend’s bracket · read-only") + "</span>" +
      (incoming ? "" : '<button class="btn ghost tiny" id="roBack" type="button">' + ic("fa-solid fa-arrow-left") + " Back</button>") +
      "</div>";

    var sub = (winnerChip(picks) || statsRow(picks))
      ? '<div class="subbar">' + winnerChip(picks) + statsRow(picks) + "</div>" : "";

    var cta = '<div class="cta"><h3>Think you can do better?</h3>' +
      "<p>Build your own World Cup 2026 bracket and challenge your friends.</p><div class=\"row\">" +
      (incoming ? '<button class="btn" id="ctaSave" type="button">' + ic("fa-solid fa-bookmark") + " Save to my brackets</button>" : "") +
      '<button class="btn primary" id="ctaCreate" type="button">' + ic("fa-solid fa-plus") + " Create your own</button>" +
      "</div></div>";

    APP.innerHTML = head + sub + boardHtml(resolved, scored, "view") + cta;

    var back = APP.querySelector("#roBack");
    if (back) back.addEventListener("click", function () { go("home"); });
    var create = APP.querySelector("#ctaCreate");
    if (create) create.addEventListener("click", function () { openEditor(null); });
    var save = APP.querySelector("#ctaSave");
    if (save) save.addEventListener("click", function () {
      WC.importBracket(ro.name, ro.picks);
      toast("Saved to your brackets.", "good"); go("home");
    });
  }

  // ------------------------------------------------------------ incoming link
  function handleIncoming() {
    var parsed = WC.parseShareHash();
    if (!parsed) return false;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    openReadonly({ name: parsed.name, picks: parsed.picks, incoming: true });
    return true;
  }

  // ------------------------------------------------- STORY IMAGE (9:16)
  // Renders the bracket to a 1080x1920 canvas — title + champion on top,
  // the full knockout tree below — for Instagram stories etc.
  function generateStoryImage(bracket) {
    var picks = bracket.picks;
    var resolved = WC.resolve(picks);
    var scored = WC.score(picks);
    var champ = WC.champion(picks);

    var W = 1080, H = 1920;
    var canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d");

    var C = {
      bg0: "#0c1733", bg1: "#0a0f1f", panel: "#16213f", line: "#2c3c66",
      text: "#eef2ff", muted: "#9aa6c8", primary: "#3b82f6", primary2: "#7aa6ff",
      good: "#22c55e", bad: "#f43f5e"
    };
    var EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    var FLAG = '"Twemoji Country Flags", ' + EMOJI;
    var SANS = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function txt(s, x, y, font, color, align, baseline) {
      ctx.font = font; ctx.fillStyle = color;
      ctx.textAlign = align || "left"; ctx.textBaseline = baseline || "alphabetic";
      ctx.fillText(s, x, y);
    }
    function ellip(s, font, maxw) {
      ctx.font = font;
      if (ctx.measureText(s).width <= maxw) return s;
      var lo = 0, hi = s.length;
      while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (ctx.measureText(s.slice(0, mid) + "…").width <= maxw) lo = mid; else hi = mid - 1; }
      return s.slice(0, lo) + "…";
    }
    function wrap(s, font, maxw, maxLines) {
      ctx.font = font;
      var words = String(s).split(/\s+/), lines = [], cur = "";
      for (var i = 0; i < words.length; i++) {
        var t = cur ? cur + " " + words[i] : words[i];
        if (ctx.measureText(t).width <= maxw || !cur) cur = t;
        else { lines.push(cur); cur = words[i]; if (lines.length === maxLines - 1) { cur = words.slice(i).join(" "); break; } }
      }
      if (cur) lines.push(cur);
      return lines.slice(0, maxLines).map(function (l) { return ellip(l, font, maxw); });
    }

    function paint() {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

      var cy = 90;
      try { ctx.letterSpacing = "3px"; } catch (e) {}
      txt("FIFA WORLD CUP 2026 · KNOCKOUT", W / 2, cy, "700 24px " + SANS, C.primary2, "center");
      try { ctx.letterSpacing = "0px"; } catch (e) {}

      cy += 14;
      var titleFont = "800 54px " + SANS;
      var tlines = wrap(bracket.name || "My Bracket", titleFont, W - 110, 2);
      cy += 48;
      tlines.forEach(function (l) { txt(l, W / 2, cy, titleFont, C.text, "center"); cy += 60; });
      cy += 2;

      if (champ) {
        try { ctx.letterSpacing = "2px"; } catch (e) {}
        txt("PREDICTED CHAMPION", W / 2, cy, "700 20px " + SANS, C.muted, "center");
        try { ctx.letterSpacing = "0px"; } catch (e) {}
        cy += 50;
        var flag = WC.team(champ).flag, nm = WC.team(champ).name;
        var nameFont = "800 48px " + SANS, flagFont = "42px " + FLAG, trFont = "40px " + EMOJI;
        ctx.font = trFont; var tw = ctx.measureText("🏆").width;
        ctx.font = flagFont; var fw = ctx.measureText(flag).width;
        ctx.font = nameFont; var nw = ctx.measureText(nm).width;
        var gp = 16, sx = (W - (tw + gp + fw + gp + nw)) / 2;
        ctx.save(); ctx.shadowColor = "rgba(255,205,50,0.95)"; ctx.shadowBlur = 24;
        txt("🏆", sx, cy, trFont, "#ffd24d", "left", "middle"); ctx.restore();
        txt(flag, sx + tw + gp, cy, flagFont, C.text, "left", "middle");
        txt(nm, sx + tw + gp + fw + gp, cy, nameFont, "#ffd76a", "left", "middle");
        var cg = scored.perMatch[104].grade;
        if (cg !== "pending") { cy += 32; txt(cg === "correct" ? "✓ Champion called" : "✗ Eliminated", W / 2, cy, "700 22px " + SANS, cg === "correct" ? C.good : C.bad, "center"); cy += 14; }
        else { cy += 22; }
      } else {
        cy += 42;
        txt(WC.pickCount(picks) + " of " + WC.MATCHES.length + " picks made", W / 2, cy, "700 28px " + SANS, C.muted, "center");
        cy += 16;
      }

      // ---- full bracket: Round of 32 -> Final. The sparse later rounds overlap
      //      leftward into the whitespace so the whole 32-team tree fits big. ----
      var GOLD = "#ffce4d";
      var CW = 244, GAP = 22, HH = 22, SH = 34, CH = HH + 2 * SH;
      var ncol = 4; // R32, R16, QF, SF — the Final is nested into the SF column
      var boardW = (ncol - 1) * (CW + GAP) + CW;
      var footerH = 64;
      var areaX = (W - boardW) / 2, areaY = cy + 18, areaH = H - footerH - areaY;
      var RU = (areaH - CH) / MAX_ROW;
      function colOf(m) { return m.id === 104 ? 3 : ROUND_INDEX[m.round]; }
      function bx(id) { return areaX + colOf(WC.matchById(id)) * (CW + GAP); }
      function by(id) { return areaY + ROW_OF[id] * RU; }

      // connectors — right angles only, drawn first so cards sit on top
      ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.lineCap = "butt";
      WC.MATCHES.forEach(function (m) {
        if (m.id === 104) {
          // Final sits between the two semifinals: a straight vertical line comes
          // down from the upper semi and up from the lower semi to meet it.
          var fTop = by(104), fBot = by(104) + CH;
          ["a", "b"].forEach(function (side) {
            var c = m[side].win; if (c == null) return;
            var scx = bx(c) + CW / 2;
            ctx.beginPath();
            if (by(c) < fTop) { ctx.moveTo(scx, by(c) + CH); ctx.lineTo(scx, fTop); }
            else { ctx.moveTo(scx, by(c)); ctx.lineTo(scx, fBot); }
            ctx.stroke();
          });
          return;
        }
        ["a", "b"].forEach(function (side) {
          if (m[side].win == null) return;
          var c = m[side].win;
          var x1 = bx(c) + CW, y1 = by(c) + CH / 2, x2 = bx(m.id), y2 = by(m.id) + CH / 2, mx = (x1 + x2) / 2;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(mx, y1); ctx.lineTo(mx, y2); ctx.lineTo(x2, y2); ctx.stroke();
        });
      });

      // cards
      WC.MATCHES.forEach(function (m) {
        var x = bx(m.id), y = by(m.id), rm = resolved[m.id], grade = scored.perMatch[m.id];
        var isFinal = m.id === 104;
        ctx.fillStyle = C.panel; rr(x, y, CW, CH, 13); ctx.fill();
        if (isFinal) {
          ctx.save(); ctx.shadowColor = "rgba(255,190,40,0.55)"; ctx.shadowBlur = 26;
          ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; rr(x, y, CW, CH, 13); ctx.stroke(); ctx.restore();
        } else {
          ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; rr(x, y, CW, CH, 13); ctx.stroke();
        }
        txt(isFinal ? "FINAL" : WC.round(m.round).name, x + 13, y + HH / 2, "800 12px " + SANS, isFinal ? GOLD : C.muted, "left", "middle");
        if (WC.isLocked(m.id)) txt("FT", x + CW - 13, y + HH / 2, "800 11px " + SANS, C.good, "right", "middle");
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + HH); ctx.lineTo(x + CW, y + HH); ctx.stroke();
        drawSlot(m, "a", x, y + HH, rm, grade, CW, SH, isFinal);
        drawSlot(m, "b", x, y + HH + SH, rm, grade, CW, SH, isFinal);
      });

      function drawSlot(m, side, x, sy, rm, grade, w, sh, isFinal) {
        var code = rm[side], chosen = picks[m.id] === side;
        var bar = null, nameColor = C.text, mark = null, markColor = C.muted, trophy = false;
        if (grade.actual != null && code) {
          var aw = code === grade.actual;
          if (chosen) { if (aw) { bar = C.good; mark = "✓"; markColor = C.good; } else { bar = C.bad; mark = "✗"; markColor = C.bad; } }
          else if (aw) { mark = "›"; markColor = C.good; }
          else { nameColor = C.muted; }
        } else if (chosen) { bar = C.primary; mark = "✓"; markColor = C.primary2; }
        if (isFinal && chosen) { trophy = true; bar = GOLD; }       // champion → glowing trophy
        var cyr = sy + sh / 2;
        if (bar) { ctx.fillStyle = bar; ctx.fillRect(x, sy, 5, sh); }
        if (code) txt(WC.team(code).flag, x + 13, cyr, "25px " + FLAG, C.text, "left", "middle");
        else txt("·", x + 20, cyr, "20px " + SANS, C.muted, "left", "middle");
        var nm = code ? WC.team(code).name : slotLabel(m, side, resolved);
        var nf = (code ? (chosen ? "800 " : "700 ") : "600 ") + "20px " + SANS;
        var nameCol = code ? (trophy ? GOLD : nameColor) : C.muted;
        txt(ellip(nm, nf, w - 48 - 26), x + 48, cyr, nf, nameCol, "left", "middle");
        if (trophy) {
          ctx.save(); ctx.shadowColor = "rgba(255,205,50,0.95)"; ctx.shadowBlur = 16;
          txt("🏆", x + w - 14, cyr, "22px " + EMOJI, GOLD, "right", "middle"); ctx.restore();
        } else if (mark) {
          txt(mark, x + w - 13, cyr, "800 20px " + SANS, markColor, "right", "middle");
        }
      }

      // footer — short URL so the link travels with the image
      txt("wc.bidwat.com", W / 2, H - 26, "500 18px " + SANS, C.muted, "center");
    }

    // Make sure the flag webfont is actually fetched (pass a flag glyph so the
    // unicode-range face loads), then paint.
    var sample = champ ? WC.team(champ).flag : "🇧🇷";
    var ready = (document.fonts && document.fonts.load)
      ? Promise.all([
          document.fonts.load('21px "Twemoji Country Flags"', sample),
          document.fonts.load('46px "Twemoji Country Flags"', sample),
          document.fonts.ready
        ]).catch(function () {})
      : Promise.resolve();
    return ready.then(function () { paint(); return canvas; });
  }

  function openStoryModal(bracket) {
    openModal(
      '<button class="close-x" aria-label="Close">' + ic("fa-solid fa-xmark") + "</button>" +
      "<h3>Story image</h3>" +
      '<p class="sub" id="storyMsg">Rendering your 9:16 image…</p>' +
      '<div class="story-wrap" id="storyWrap"><div class="story-spin">' + ic("fa-solid fa-spinner fa-spin") + "</div></div>" +
      '<div class="modal-actions" id="storyActions"></div>'
    );
    generateStoryImage(bracket).then(function (canvas) {
      track("story_image", { action: "generated" });
      var dataUrl = canvas.toDataURL("image/png");
      MODAL_CARD.querySelector("#storyWrap").innerHTML = '<img class="story-img" alt="World Cup bracket story image" src="' + dataUrl + '" />';
      MODAL_CARD.querySelector("#storyMsg").textContent = "Save it, then add it to your Instagram story — or share anywhere.";
      var fname = ((bracket.name || "my-bracket").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-bracket") + "-worldcup-2026.png";
      var actions = MODAL_CARD.querySelector("#storyActions");
      actions.innerHTML = '<button class="btn" id="storyDownload" type="button">' + ic("fa-solid fa-download") + " Download</button>";
      MODAL_CARD.querySelector("#storyDownload").addEventListener("click", function () {
        var a = document.createElement("a"); a.href = dataUrl; a.download = fname;
        document.body.appendChild(a); a.click(); a.remove();
        track("story_image", { action: "download" });
      });
      canvas.toBlob(function (blob) {
        if (!blob || !navigator.canShare) return;
        try {
          var file = new File([blob], fname, { type: "image/png" });
          if (!navigator.canShare({ files: [file] })) return;
          var sb = document.createElement("button");
          sb.className = "btn primary"; sb.type = "button";
          sb.innerHTML = ic("fa-solid fa-share-nodes") + " Share";
          sb.addEventListener("click", function () {
            navigator.share({ files: [file], title: bracket.name || "My World Cup 2026 bracket" })
              .then(function () { track("story_image", { action: "share" }); }).catch(function () {});
          });
          actions.insertBefore(sb, actions.firstChild);
        } catch (e) {}
      }, "image/png");
    }).catch(function () {
      MODAL_CARD.querySelector("#storyMsg").textContent = "Sorry — couldn’t generate the image.";
      MODAL_CARD.querySelector("#storyWrap").innerHTML = "";
    });
  }

  // ------------------------------------------------------------ SHARE
  var SHARE_ICON = {
    whatsapp: "fa-brands fa-whatsapp", telegram: "fa-brands fa-telegram",
    twitter: "fa-brands fa-x-twitter", facebook: "fa-brands fa-facebook-f",
    reddit: "fa-brands fa-reddit-alien", email: "fa-solid fa-envelope"
  };
  function openShareModal(rec) {
    track("bracket_shared", { complete: WC.isComplete(rec.picks), picks: WC.pickCount(rec.picks) });
    var url = WC.buildShareUrl(rec);
    var champ = WC.champion(rec.picks);
    var mobile = isMobile();
    var channels = WC.shareChannels(url, rec.name, champ ? teamName(champ) : "", mobile);
    var canNative = !!navigator.share;

    var igBtn = mobile
      ? '<button class="share-btn" data-ch="instagram" id="igShare" type="button"><span class="ic">' + ic("fa-brands fa-instagram") + "</span>Instagram</button>"
      : "";

    openModal(
      '<button class="close-x" aria-label="Close">' + ic("fa-solid fa-xmark") + "</button>" +
      "<h3>Share “" + esc(rec.name) + "”</h3>" +
      '<p class="sub">The whole bracket is packed into this link — no account, no server. It opens as a read-only board your friends can save or beat.</p>' +
      '<div class="urlbox"><input id="shareUrl" readonly value="' + esc(url) + '" />' +
      '<button class="btn primary" id="copyUrl" type="button">' + ic("fa-solid fa-copy") + " Copy</button></div>" +
      '<button class="btn story-cta" id="storyBtn" type="button">' + ic("fa-brands fa-instagram") + " Make a story image (9:16)</button>" +
      '<div class="share-grid">' +
        igBtn +
        channels.map(function (c) {
          return '<a class="share-btn" data-ch="' + c.key + '" href="' + esc(c.href) + '" target="_blank" rel="noopener">' +
            '<span class="ic">' + ic(SHARE_ICON[c.key] || "fa-solid fa-share-nodes") + "</span>" + esc(c.label) + "</a>";
        }).join("") +
        (canNative ? '<button class="share-btn" data-ch="more" id="nativeShare" type="button"><span class="ic">' + ic("fa-solid fa-ellipsis") + "</span>More…</button>" : "") +
      "</div>"
    );
    MODAL_CARD.querySelector("#storyBtn").addEventListener("click", function () { openStoryModal(rec); });
    var ig = MODAL_CARD.querySelector("#igShare");
    if (ig) ig.addEventListener("click", function () {
      copyText(WC.shareMessage(url, rec.name, champ ? teamName(champ) : ""));
      toast("Copied! Paste it into your Instagram DM.", "good");
      track("share_channel", { method: "instagram" });
      setTimeout(function () { try { window.location.href = "instagram://app"; } catch (e) {} }, 250);
    });
    MODAL_CARD.querySelector("#copyUrl").addEventListener("click", function () {
      track("share_channel", { method: "copy" });
      copyText(url).then(function (ok) { toast(ok ? "Link copied!" : "Press Ctrl+C to copy.", ok ? "good" : "bad"); });
    });
    MODAL_CARD.querySelector("#shareUrl").addEventListener("focus", function (e) { e.target.select(); });
    MODAL_CARD.querySelectorAll(".share-btn[data-ch]").forEach(function (el) {
      if (el.dataset.ch === "more") return;
      el.addEventListener("click", function () { track("share_channel", { method: el.dataset.ch }); });
    });
    var nb = MODAL_CARD.querySelector("#nativeShare");
    if (nb) nb.addEventListener("click", function () {
      track("share_channel", { method: "native" });
      navigator.share({ title: rec.name, text: "My World Cup 2026 bracket", url: url }).catch(function () {});
    });
  }

  // ------------------------------------------------------------ COMPARE
  function renderCompare() {
    var list = WC.loadBrackets();
    var head = '<div class="section-head"><div><h1>Compare &amp; Leaderboard</h1>' +
      "<p>Everyone’s standings against the real results so far.</p></div><div class=\"spacer\"></div>" +
      '<button class="btn ghost" id="cmpHome" type="button">' + ic("fa-solid fa-arrow-left") + " My brackets</button></div>";

    if (!list.length) {
      APP.innerHTML = head + '<p class="compare-empty">No brackets yet. Create one or open a friend’s link to start a leaderboard.</p>';
      APP.querySelector("#cmpHome").addEventListener("click", function () { go("home"); });
      return;
    }

    var rows = list.map(function (b) { return { b: b, s: WC.score(b.picks), champ: WC.champion(b.picks) }; })
      .sort(function (x, y) { return (y.s.totals.points - x.s.totals.points) || (y.s.totals.correct - x.s.totals.correct); });
    var anyGraded = rows.some(function (r) { return r.s.totals.graded > 0; });

    APP.innerHTML = head + '<div class="board-scroll"><table class="lead-table"><thead><tr>' +
      '<th class="num">#</th><th>Bracket</th><th>Predicted winner</th><th class="num">Correct</th><th class="num">Points</th><th></th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        var b = r.b, s = r.s;
        return '<tr class="' + (b.mine ? "me" : "") + '"><td class="rank">' + (i + 1) + "</td>" +
          '<td><div class="who"><b>' + esc(b.name) + '</b> <span class="tag ' + (b.mine ? "mine" : "friend") + '">' + (b.mine ? "You" : "Friend") + "</span></div></td>" +
          "<td>" + (r.champ ? '<span class="who">' + flagSpan(r.champ) + esc(teamName(r.champ)) + "</span>" : "—") + "</td>" +
          '<td class="num">' + s.totals.correct + (s.totals.graded ? "<small>/" + s.totals.graded + "</small>" : "") + "</td>" +
          '<td class="num pts">' + s.totals.points + "</td>" +
          '<td class="num"><button class="linklike" data-open="' + b.id + '" type="button">' + (b.mine ? "Open" : "View") + "</button></td></tr>";
      }).join("") + "</tbody></table></div>" +
      (anyGraded ? "" : '<p class="compare-empty" style="margin-top:16px">No matches resolved yet — points appear once the knockout games are played (or once you enter official results).</p>');

    APP.querySelector("#cmpHome").addEventListener("click", function () { go("home"); });
    APP.querySelectorAll("[data-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var rec = WC.getBracket(btn.dataset.open);
        if (rec) rec.mine ? openEditor(rec) : openReadonly({ id: rec.id, name: rec.name, picks: rec.picks, mine: false, incoming: false });
      });
    });
  }

  // ------------------------------------------------- OFFICIAL RESULTS editor
  function resolveOfficial() {
    var official = WC.officialResults(), tmp = {};
    function slot(s) { if (!s) return null; if (s.team) return s.team; if (s.win != null) { var r = tmp[s.win]; return r ? r.winner : null; } return null; }
    WC.MATCHES.forEach(function (m) {
      var a = slot(m.a), b = slot(m.b), w = official[m.id] != null ? official[m.id] : null;
      tmp[m.id] = { a: a, b: b, winner: w };
    });
    return tmp;
  }

  function openResultsEditor() {
    var resolved = resolveOfficial(), official = WC.officialResults();
    var rows = WC.MATCHES.slice().sort(function (a, b) {
      return ROUND_INDEX[a.round] - ROUND_INDEX[b.round] || ORD[a.id] - ORD[b.id];
    }).map(function (m) {
      var rm = resolved[m.id], a = rm.a, b = rm.b, ready = a && b, cur = official[m.id] || "";
      var opts = '<option value="">—</option>';
      if (a) opts += '<option value="' + a + '"' + (cur === a ? " selected" : "") + ">" + esc(teamName(a)) + "</option>";
      if (b) opts += '<option value="' + b + '"' + (cur === b ? " selected" : "") + ">" + esc(teamName(b)) + "</option>";
      var rn = WC.round(m.round).name;
      return '<div class="result-row"><span><b>' + esc(rn) + " " + ORD[m.id] + "</b> · " +
        (ready ? flagSpan(a) + " " + esc(teamName(a)) + ' <span class="vs">vs</span> ' + flagSpan(b) + " " + esc(teamName(b))
               : '<span class="vs">awaiting earlier results</span>') + "</span>" +
        '<select data-mid="' + m.id + '"' + (ready ? "" : " disabled") + ">" + opts + "</select></div>";
    }).join("");

    openModal(
      '<button class="close-x" aria-label="Close">' + ic("fa-solid fa-xmark") + "</button>" +
      "<h3>Official results</h3><p class=\"sub\">Set the real winner of each game. This updates scoring for every saved bracket. Stored locally; the live feed also fills these in automatically.</p>" +
      '<div class="results-list">' + rows + "</div>" +
      '<div class="modal-actions"><button class="btn ghost" id="clearResults" type="button">' + ic("fa-solid fa-eraser") + " Clear all</button>" +
      '<button class="btn primary" data-close="1" type="button">Done</button></div>'
    );
    MODAL_CARD.querySelectorAll("select[data-mid]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        WC.setOfficialResult(parseInt(sel.dataset.mid, 10), sel.value || null);
        openResultsEditor(); renderDataStrip(); renderFooter();
      });
    });
    MODAL_CARD.querySelector("#clearResults").addEventListener("click", function () {
      WC.MATCHES.forEach(function (m) { WC.setOfficialResult(m.id, null); });
      openResultsEditor(); renderDataStrip(); renderFooter(); toast("Results cleared.");
    });
  }

  // ------------------------------------------------------------ boot
  function boot() {
    // Warm the icon webfonts so brand/share glyphs are ready before any modal opens.
    if (document.fonts && document.fonts.load) {
      try {
        document.fonts.load('400 16px "Font Awesome 6 Brands"');
        document.fonts.load('900 16px "Font Awesome 6 Free"');
        document.fonts.load('16px "Twemoji Country Flags"');
      } catch (e) {}
    }
    initAnalytics();
    handleIncoming();
    render();
    if (WC.feedActive()) {
      WC.fetchResults().then(function (r) {
        renderDataStrip(); renderFooter();
        if (r.ok && r.count) render();
      });
    }
  }
  boot();
})();
