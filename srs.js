/*
 * Spaced repetition scheduler, a simplified version of the SM-2 algorithm
 * (the one behind SuperMemo and Anki).
 *
 * Each card has an "ease" (how easy you find it) and an "interval" (days
 * until you see it again). Remembering a card multiplies the interval by
 * the ease, so cards you know well come back less and less often. Forgetting
 * one resets it to "learning" and lowers its ease.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SRS = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MIN = 60 * 1000, DAY = 24 * 60 * MIN;
  const GRADES = ["again", "hard", "good", "easy"];
  const MIN_EASE = 1.3, START_EASE = 2.5, MAX_INTERVAL = 365;

  function newCard(front, back, now = Date.now()) {
    return {
      id: Math.random().toString(36).slice(2, 10) + now.toString(36),
      front: String(front).trim(), back: String(back).trim(),
      due: now, interval: 0, ease: START_EASE, reps: 0, lapses: 0, created: now
    };
  }

  /** Returns the updated card after answering with grade 0..3 (again, hard, good, easy). */
  function review(card, grade, now = Date.now()) {
    if (!(grade >= 0 && grade <= 3)) throw new RangeError("grade must be 0..3");
    const c = { ...card };
    if (grade === 0) {
      c.lapses += 1;
      c.reps = 0;
      c.interval = 0;
      c.ease = Math.max(MIN_EASE, c.ease - 0.2);
      c.due = now + 10 * MIN;            // see it again later in this session
      return c;
    }
    let days;
    if (c.reps === 0) days = [0, 1, 1, 4][grade];        // first time remembered
    else if (c.reps === 1 && grade >= 2) days = grade === 3 ? 6 : 3;
    else if (grade === 1) days = c.interval * 1.2;
    else if (grade === 2) days = c.interval * c.ease;
    else days = c.interval * c.ease * 1.3;
    if (c.reps > 0) days = Math.max(days, c.interval + (grade === 1 ? 0 : 1)); // never go backwards on a pass
    c.interval = Math.min(MAX_INTERVAL, Math.max(1, Math.round(days)));
    c.ease = Math.max(MIN_EASE, c.ease + [0, -0.15, 0, 0.15][grade]);
    c.reps += 1;
    c.due = now + c.interval * DAY;
    return c;
  }

  /** "10m", "1d", "3w", "4mo": what each button would do, shown on the button. */
  function preview(card, grade, now = Date.now()) {
    const ms = review(card, grade, now).due - now;
    if (ms < DAY) return Math.round(ms / MIN) + "m";
    const d = Math.round(ms / DAY);
    if (d < 14) return d + "d";
    if (d < 60) return Math.round(d / 7) + "w";
    if (d < 365) return Math.round(d / 30) + "mo";
    return (d / 365).toFixed(1).replace(/\.0$/, "") + "y";
  }

  const isDue = (card, now = Date.now()) => card.due <= now;

  /** Due cards first (most overdue first), new cards limited to `newLimit`. */
  function queue(cards, now = Date.now(), newLimit = 20) {
    const due = cards.filter((c) => c.reps > 0 || c.lapses > 0).filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due);
    const fresh = cards.filter((c) => c.reps === 0 && c.lapses === 0 && isDue(c, now)).sort((a, b) => a.created - b.created).slice(0, newLimit);
    return [...due, ...fresh];
  }

  /** new / learning / young (< 21 days) / mature */
  function stage(card) {
    if (card.reps === 0 && card.lapses === 0) return "new";
    if (card.reps === 0) return "learning";
    return card.interval < 21 ? "young" : "mature";
  }

  /** Parse pasted text: one card per line, "front<TAB>back", "front;back" or "front, back". */
  function parseCards(text) {
    const out = [];
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : line.includes(" - ") ? " - " : ",";
      const i = line.indexOf(sep);
      if (i < 1) continue;
      const front = line.slice(0, i).trim().replace(/^"|"$/g, ""), back = line.slice(i + sep.length).trim().replace(/^"|"$/g, "");
      if (front && back) out.push([front, back]);
    }
    return out;
  }

  return { newCard, review, preview, isDue, queue, stage, parseCards, GRADES, DAY, MIN };
});
