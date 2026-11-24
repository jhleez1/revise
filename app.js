/*
 * revise: flashcards with spaced repetition and a focus timer.
 * All data lives in localStorage on this device. Scheduling is in srs.js.
 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KEY = "revise.v1";
  const DAY = SRS.DAY;
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ------------------------------------------------------------------ store
  function fresh() {
    const now = Date.now();
    return {
      // every card is due now; "created" keeps them in order
      decks: (window.REVISE_SAMPLES || []).map((d) => ({ id: uid(), name: d.name, cards: d.cards.map(([f, b], i) => ({ ...SRS.newCard(f, b, now), created: now + i })) })),
      log: [],                                      // { t, g, deck, wasNew }
      focus: { focusMin: 25, breakMin: 5, sound: true, sessions: [] },
      newPerDay: 20
    };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.decks)) return { ...fresh(), ...s, focus: { ...fresh().focus, ...s.focus } };
    } catch { /* private mode or bad data: start fresh */ }
    return fresh();
  }
  let state = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast("Could not save: storage is full or blocked"); } }

  let toastTimer;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600); }

  const deckById = (id) => state.decks.find((d) => d.id === id);

  // ---------------------------------------------------------------- routing
  const VIEWS = ["study", "decks", "focus", "stats"];
  function route() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "study";
    VIEWS.forEach((name) => ($("v-" + name).hidden = name !== v));
    document.querySelectorAll("nav a").forEach((a) => { if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    ({ study: renderStudy, decks: renderDecks, focus: renderFocus, stats: renderStats })[v]();
  }
  window.addEventListener("hashchange", route);

  // ------------------------------------------------------------------ study
  let studyDeck = "all";
  let current = null;            // { deckId, card }
  let revealed = false;

  function newSeenToday() { const k = dayKey(Date.now()); return state.log.filter((l) => l.wasNew && dayKey(l.t) === k).length; }
  function selectedCards() {
    const decks = studyDeck === "all" ? state.decks : state.decks.filter((d) => d.id === studyDeck);
    return decks.flatMap((d) => d.cards.map((card) => ({ deckId: d.id, card })));
  }
  function buildQueue() {
    const items = selectedCards(), now = Date.now();
    const limit = Math.max(0, state.newPerDay - newSeenToday());
    const order = SRS.queue(items.map((i) => i.card), now, limit);
    return order.map((c) => items.find((i) => i.card === c));
  }
  function renderStudy() {
    const sel = $("studyDeck");
    sel.innerHTML = `<option value="all">All decks</option>` + state.decks.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
    if (studyDeck !== "all" && !deckById(studyDeck)) studyDeck = "all";
    sel.value = studyDeck;
    nextCard();
  }
  function nextCard() {
    const q = buildQueue();
    const nNew = q.filter((i) => i.card.reps === 0 && i.card.lapses === 0).length;
    $("studyCounts").innerHTML = `<b class="d">${q.length - nNew}</b> to review · <b class="n">${nNew}</b> new`;
    current = q[0] || null;
    revealed = false;
    $("flash").hidden = $("answerBar").hidden = !current;
    $("grades").hidden = true;
    $("done").hidden = !!current;
    if (!current) {
      const upcoming = selectedCards().map((i) => i.card.due).filter((d) => d > Date.now()).sort((a, b) => a - b)[0];
      $("doneMsg").textContent = !selectedCards().length ? "This deck has no cards yet." : upcoming ? `Next card is due ${when(upcoming)}.` : "Come back tomorrow for new cards.";
      return;
    }
    $("sideLabel").textContent = "Question";
    $("front").textContent = current.card.front;
    $("back").textContent = current.card.back;
    $("back").hidden = true;
  }
  function when(t) {
    const ms = t - Date.now();
    if (ms < 60 * 60 * 1000) return `in ${Math.max(1, Math.round(ms / 60000))} min`;
    if (ms < DAY) return `in ${Math.round(ms / 3600000)} hours`;
    const d = Math.round(ms / DAY);
    return d === 1 ? "tomorrow" : `in ${d} days`;
  }
  function reveal() {
    if (!current || revealed) return;
    revealed = true;
    $("back").hidden = false;
    $("sideLabel").textContent = "Answer";
    $("answerBar").hidden = true;
    $("grades").hidden = false;
    const now = Date.now();
    document.querySelectorAll(".g").forEach((b) => (b.querySelector("span").textContent = SRS.preview(current.card, +b.dataset.g, now)));
    document.querySelector(".g.good").focus({ preventScroll: true });
  }
  function grade(g) {
    if (!current || !revealed) return;
    const deck = deckById(current.deckId);
    const i = deck.cards.indexOf(current.card);
    const wasNew = current.card.reps === 0 && current.card.lapses === 0;
    deck.cards[i] = SRS.review(current.card, g, Date.now());
    state.log.push({ t: Date.now(), g, deck: deck.id, wasNew });
    if (state.log.length > 20000) state.log = state.log.slice(-20000);
    save();
    nextCard();
  }
  $("studyDeck").addEventListener("change", (e) => { studyDeck = e.target.value; nextCard(); });
  $("show").addEventListener("click", reveal);
  $("grades").addEventListener("click", (e) => { const b = e.target.closest(".g"); if (b) grade(+b.dataset.g); });
  document.addEventListener("keydown", (e) => {
    const typing = e.target instanceof Element && e.target.closest("input, textarea, select, button:not(.g)");
    if ($("v-study").hidden || typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === " " || e.key === "Enter") && !revealed) { e.preventDefault(); reveal(); }
    else if (revealed && /^[1-4]$/.test(e.key)) { e.preventDefault(); grade(+e.key - 1); }
  });

  // ------------------------------------------------------------------ decks
  let editing = null;
  function counts(deck) {
    const now = Date.now(), c = { due: 0, fresh: 0, total: deck.cards.length };
    deck.cards.forEach((k) => { if (k.reps === 0 && k.lapses === 0) c.fresh++; else if (k.due <= now) c.due++; });
    return c;
  }
  function renderDecks() {
    $("deckList").innerHTML = state.decks.length ? state.decks.map((d) => {
      const c = counts(d);
      return `<li class="deck"><h3>${esc(d.name)}</h3><p class="meta"><b class="d">${c.due}</b> due · <b class="n">${c.fresh}</b> new · ${c.total} cards</p>
        <div class="acts"><button class="btn" data-study="${d.id}">Study</button><button class="btn" data-edit="${d.id}">Edit</button></div></li>`;
    }).join("") : `<li class="panel muted">No decks yet. Make one with “New deck”.</li>`;
    if (editing && !deckById(editing)) editing = null;
    $("deckEditor").hidden = !editing;
    if (editing) renderEditor();
  }
  function renderEditor() {
    if (!editing) return;
    const d = deckById(editing), q = $("cardSearch").value.trim().toLowerCase();
    $("edName").textContent = d.name;
    const shown = d.cards.filter((c) => !q || (c.front + " " + c.back).toLowerCase().includes(q));
    $("cardList").innerHTML = shown.map((c) => `<li><span>${esc(c.front)}</span><span class="b muted">${esc(c.back)}</span><span class="st">${SRS.stage(c)}</span><button class="icon-btn" data-del="${c.id}" aria-label="Delete card ${esc(c.front)}">×</button></li>`).join("")
      || `<li class="muted">${d.cards.length ? "No cards match." : "No cards yet. Add one above."}</li>`;
  }
  $("deckList").addEventListener("click", (e) => {
    const s = e.target.closest("[data-study]"), ed = e.target.closest("[data-edit]");
    if (s) { studyDeck = s.dataset.study; location.hash = "study"; }
    if (ed) { editing = ed.dataset.edit; $("cardSearch").value = ""; renderDecks(); $("deckEditor").scrollIntoView({ behavior: "smooth", block: "start" }); $("addFront").focus({ preventScroll: true }); }
  });
  $("newDeck").addEventListener("click", () => {
    const name = (prompt("Name for the new deck:") || "").trim();
    if (!name) return;
    const d = { id: uid(), name, cards: [] };
    state.decks.push(d); editing = d.id; save(); renderDecks(); $("addFront").focus();
  });
  $("edClose").addEventListener("click", () => { editing = null; renderDecks(); });
  $("addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = $("addFront").value.trim(), b = $("addBack").value.trim();
    if (!f || !b) return;
    deckById(editing).cards.push(SRS.newCard(f, b));
    $("addFront").value = $("addBack").value = "";
    save(); renderDecks(); $("addFront").focus(); toast("Card added");
  });
  $("bulkAdd").addEventListener("click", () => {
    const pairs = SRS.parseCards($("bulkText").value);
    if (!pairs.length) return toast("No cards found. Use one “front;back” per line.");
    const now = Date.now();
    deckById(editing).cards.push(...pairs.map(([f, b], i) => ({ ...SRS.newCard(f, b, now), created: now + i })));
    $("bulkText").value = ""; save(); renderDecks(); toast(`Added ${pairs.length} card${pairs.length > 1 ? "s" : ""}`);
  });
  $("cardSearch").addEventListener("input", renderEditor);
  $("cardList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    const d = deckById(editing); d.cards = d.cards.filter((c) => c.id !== b.dataset.del); save(); renderDecks();
  });
  $("edRename").addEventListener("click", () => {
    const d = deckById(editing), name = (prompt("Rename deck:", d.name) || "").trim();
    if (name) { d.name = name; save(); renderDecks(); }
  });
  $("edDelete").addEventListener("click", () => {
    const d = deckById(editing);
    if (!confirm(`Delete “${d.name}” and its ${d.cards.length} cards? This cannot be undone (unless you have a backup).`)) return;
    state.decks = state.decks.filter((x) => x !== d); editing = null; save(); renderDecks(); toast("Deck deleted");
  });
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvCell = (s) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  $("edExport").addEventListener("click", () => {
    const d = deckById(editing);
    download(d.name.replace(/[^\w-]+/g, "_") + ".csv", "front,back\n" + d.cards.map((c) => csvCell(c.front) + "," + csvCell(c.back)).join("\n"), "text/csv");
  });
  $("backup").addEventListener("click", () => download(`revise-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 1), "application/json"));
  $("restore").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.decks) || !data.decks.every((d) => d && typeof d.name === "string" && Array.isArray(d.cards))) throw new Error("not a revise backup");
      if (!confirm(`Replace everything here with the backup (${data.decks.length} decks)?`)) return;
      state = { ...fresh(), ...data, focus: { ...fresh().focus, ...data.focus } }; editing = null; save(); renderDecks(); toast("Backup restored");
    } catch (err) { toast("Could not read that file: " + err.message); }
  });

  // ------------------------------------------------------------------ focus
  const RING = 552.92;
  const timer = { mode: "focus", running: false, endAt: 0, left: state.focus.focusMin * 60000 };
  const total = () => (timer.mode === "focus" ? state.focus.focusMin : state.focus.breakMin) * 60000;
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const sessionsToday = () => state.focus.sessions.filter((t) => dayKey(t) === dayKey(Date.now())).length;

  function renderFocus() {
    $("setFocus").value = state.focus.focusMin; $("setBreak").value = state.focus.breakMin; $("setSound").checked = state.focus.sound;
    paintTimer();
  }
  function paintTimer() {
    const left = timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.left;
    $("tTime").textContent = fmt(left);
    $("tMode").textContent = timer.mode === "focus" ? "Focus" : "Break";
    $("tSub").textContent = timer.mode === "focus" ? `Session ${sessionsToday() + 1} today` : `${sessionsToday()} session${sessionsToday() === 1 ? "" : "s"} done today`;
    document.querySelector(".timer").classList.toggle("break", timer.mode === "break");
    $("ring").style.strokeDashoffset = RING * (1 - left / total());
    $("tStart").textContent = timer.running ? "Pause" : left < total() ? "Resume" : "Start";
    document.title = timer.running ? `${fmt(left)} · ${timer.mode === "focus" ? "Focus" : "Break"}` : "revise · flashcards and focus timer";
  }
  function beep() {
    if (!state.focus.sound) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.2);
        o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.22); });
    } catch { /* no audio */ }
  }
  function switchMode(next, finished) {
    if (finished && timer.mode === "focus") { state.focus.sessions.push(Date.now()); save(); }
    timer.mode = next; timer.running = false; timer.left = total();
    if (finished) { beep(); toast(next === "break" ? "Focus session done. Take a break!" : "Break over. Ready for another?"); }
    paintTimer();
  }
  setInterval(() => {
    if (!timer.running) return;
    if (Date.now() >= timer.endAt) switchMode(timer.mode === "focus" ? "break" : "focus", true);
    else if (!$("v-focus").hidden || document.title.includes(":")) paintTimer();
  }, 250);
  $("tStart").addEventListener("click", () => {
    if (timer.running) { timer.left = Math.max(0, timer.endAt - Date.now()); timer.running = false; }
    else { timer.endAt = Date.now() + timer.left; timer.running = true; }
    paintTimer();
  });
  $("tReset").addEventListener("click", () => { timer.running = false; timer.left = total(); paintTimer(); });
  $("tSkip").addEventListener("click", () => switchMode(timer.mode === "focus" ? "break" : "focus", false));
  for (const [id, key, max] of [["setFocus", "focusMin", 120], ["setBreak", "breakMin", 60]]) {
    $(id).addEventListener("change", (e) => {
      state.focus[key] = Math.min(max, Math.max(1, Math.round(+e.target.value) || 1)); e.target.value = state.focus[key]; save();
      if (!timer.running) { timer.left = total(); paintTimer(); }
    });
  }
  $("setSound").addEventListener("change", (e) => { state.focus.sound = e.target.checked; save(); });

  // ------------------------------------------------------------------ stats
  function streak() {
    const days = new Set(state.log.map((l) => dayKey(l.t)));
    let n = 0, t = Date.now();
    if (!days.has(dayKey(t))) t -= DAY;           // today not done yet still keeps yesterday's streak
    while (days.has(dayKey(t))) { n++; t -= DAY; }
    return n;
  }
  function renderStats() {
    const now = Date.now(), today = dayKey(now);
    const recent = state.log.filter((l) => now - l.t < 30 * DAY);
    const retention = recent.length ? Math.round((100 * recent.filter((l) => l.g > 0).length) / recent.length) + "%" : "-";
    const allCards = state.decks.flatMap((d) => d.cards);
    const tiles = [
      [streak(), "day streak"], [state.log.filter((l) => dayKey(l.t) === today).length, "reviews today"],
      [retention, "remembered (30 days)"], [allCards.length, "cards"], [sessionsToday() * state.focus.focusMin + " min", "focused today"]
    ];
    $("tiles").innerHTML = tiles.map(([v, l]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join("");

    const perDay = [];
    for (let i = 29; i >= 0; i--) { const k = dayKey(now - i * DAY); perDay.push({ k, n: state.log.filter((l) => dayKey(l.t) === k).length, i }); }
    const max = Math.max(5, ...perDay.map((d) => d.n)), W = 600, H = 160, bw = W / 30;
    $("chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reviews per day for the last 30 days, ${perDay[29].n} today">
      ${perDay.map((d, j) => { const h = d.n ? Math.max(3, (d.n / max) * (H - 30)) : 0; return `<rect class="bar-r${d.i === 0 ? " today" : ""}" x="${j * bw + 2}" y="${H - 18 - h}" width="${bw - 4}" height="${h}" rx="3"><title>${d.n} reviews</title></rect>`; }).join("")}
      <text x="0" y="${H - 4}">30 days ago</text><text x="${W}" y="${H - 4}" text-anchor="end">today</text></svg>`;

    const stages = { new: 0, learning: 0, young: 0, mature: 0 };
    allCards.forEach((c) => stages[SRS.stage(c)]++);
    const colours = { new: "var(--easy)", learning: "var(--again)", young: "var(--hard)", mature: "var(--good)" };
    $("stages").innerHTML = Object.entries(stages).map(([k, v]) => `<div class="stage" style="--c:${colours[k]}"><span>${k[0].toUpperCase() + k.slice(1)}</span><div class="track"><div class="fill" style="width:${allCards.length ? (100 * v) / allCards.length : 0}%"></div></div><b>${v}</b></div>`).join("");
  }

  // ------------------------------------------------------------------ start
  save();                        // keeps the starter decks on first visit
  route();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
