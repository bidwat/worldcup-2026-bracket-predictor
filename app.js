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

  // ------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ic(cls) { return '<i class="' + cls + '"></i>'; }
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
      return '<div class="bmatch" style="left:' + X(m.id) + "px;top:" + Y(m.id) + "px;width:" + CARD_W + 'px">' +
        matchInner(m, resolved, scored, mode) + "</div>";
    }).join("");

    return '<div class="board-scroll">' +
      '<div class="board-heads" style="width:' + width + 'px">' + heads + "</div>" +
      '<div class="board" style="width:' + width + "px;height:" + height + 'px">' +
      '<svg class="bracket-lines" width="' + width + '" height="' + height + '">' + lines + "</svg>" +
      cards + "</div></div>";
  }

  function matchInner(m, resolved, scored, mode) {
    var locked = WC.isLocked(m.id);
    return '<div class="bm-head"><span>' + esc(m.date) + "</span>" +
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

    if (grade.actual != null && code) {
      var actualWinner = code === grade.actual;
      if (chosen) {
        if (actualWinner) { classes = ["bslot", "correct"]; mk = ic("fa-solid fa-check"); }
        else { classes = ["bslot", "wrong"]; mk = ic("fa-solid fa-xmark"); }
      } else if (actualWinner) { classes = ["bslot", "advanced"]; mk = "through"; }
      else { classes.push("elim"); }
    } else if (chosen) {
      mk = ic("fa-solid fa-circle-check");
    }

    var editable = mode === "edit" && code && !locked;
    if (editable) classes.push("pickable");

    var fullLabel = code ? teamName(code) : slotLabel(m, side, resolved);
    var label = esc(fullLabel);
    return '<button class="' + classes.join(" ") + '" data-side="' + side + '" data-mid="' + m.id + '"' +
      ' title="' + label + '"' + (editable ? "" : " disabled") + ">" +
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

    APP.innerHTML = head + sub + boardHtml(resolved, scored, "edit") + savebar;
    bindBoard("edit");

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
      sEl.addEventListener("click", function () { pick(parseInt(sEl.dataset.mid, 10), sEl.dataset.side); });
    });
  }

  function randomize() {
    var picks = state.editing.picks;
    WC.MATCHES.forEach(function (m) { if (!WC.isLocked(m.id)) picks[m.id] = Math.random() < 0.5 ? "a" : "b"; });
    state.dirty = true; renderEditor(); toast("Randomized — tweak away!");
  }

  function saveCurrent(notify) {
    var b = state.editing;
    if (!b.name || !b.name.trim()) { b.name = "My bracket"; var n = APP.querySelector("#bracketName"); if (n) n.value = b.name; }
    var rec = WC.upsertBracket({ id: b.id, name: WC.trimName(b.name.trim()), picks: b.picks, mine: true });
    state.editing.id = rec.id; state.dirty = false;
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

  // ------------------------------------------------------------ SHARE
  var SHARE_ICON = {
    whatsapp: "fa-brands fa-whatsapp", telegram: "fa-brands fa-telegram",
    twitter: "fa-brands fa-x-twitter", facebook: "fa-brands fa-facebook-f",
    reddit: "fa-brands fa-reddit-alien", email: "fa-solid fa-envelope"
  };
  function openShareModal(rec) {
    var url = WC.buildShareUrl(rec);
    var champ = WC.champion(rec.picks);
    var channels = WC.shareChannels(url, rec.name, champ ? teamName(champ) : "");
    var canNative = !!navigator.share;

    openModal(
      '<button class="close-x" aria-label="Close">' + ic("fa-solid fa-xmark") + "</button>" +
      "<h3>Share “" + esc(rec.name) + "”</h3>" +
      '<p class="sub">The whole bracket is packed into this link — no account, no server. It opens as a read-only board your friends can save or beat.</p>' +
      '<div class="urlbox"><input id="shareUrl" readonly value="' + esc(url) + '" />' +
      '<button class="btn primary" id="copyUrl" type="button">' + ic("fa-solid fa-copy") + " Copy</button></div>" +
      '<div class="share-grid">' +
        channels.map(function (c) {
          return '<a class="share-btn" data-ch="' + c.key + '" href="' + esc(c.href) + '" target="_blank" rel="noopener">' +
            '<span class="ic">' + ic(SHARE_ICON[c.key] || "fa-solid fa-share-nodes") + "</span>" + esc(c.label) + "</a>";
        }).join("") +
        (canNative ? '<button class="share-btn" data-ch="more" id="nativeShare" type="button"><span class="ic">' + ic("fa-solid fa-ellipsis") + "</span>More…</button>" : "") +
      "</div>"
    );
    MODAL_CARD.querySelector("#copyUrl").addEventListener("click", function () {
      copyText(url).then(function (ok) { toast(ok ? "Link copied!" : "Press Ctrl+C to copy.", ok ? "good" : "bad"); });
    });
    MODAL_CARD.querySelector("#shareUrl").addEventListener("focus", function (e) { e.target.select(); });
    var nb = MODAL_CARD.querySelector("#nativeShare");
    if (nb) nb.addEventListener("click", function () {
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
