// Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const SRS = require("../srs.js");
const { DAY, MIN } = SRS;

const T0 = Date.UTC(2026, 0, 5, 9, 0);
const fresh = () => SRS.newCard("F = ?", "ma", T0);
const days = (c, now = T0) => Math.round((c.due - now) / DAY);

test("a new card is due straight away", () => {
  const c = fresh();
  assert.equal(SRS.isDue(c, T0), true);
  assert.equal(SRS.stage(c), "new");
});

test("first answers: again 10 min, hard 1 day, good 1 day, easy 4 days", () => {
  assert.equal(SRS.review(fresh(), 0, T0).due - T0, 10 * MIN);
  assert.equal(days(SRS.review(fresh(), 1, T0)), 1);
  assert.equal(days(SRS.review(fresh(), 2, T0)), 1);
  assert.equal(days(SRS.review(fresh(), 3, T0)), 4);
});

test("intervals grow when you keep remembering", () => {
  let c = fresh(), now = T0;
  const seen = [];
  for (let i = 0; i < 6; i++) { c = SRS.review(c, 2, now); seen.push(c.interval); now = c.due; }
  assert.deepEqual(seen, [1, 3, 8, 20, 50, 125]);
  assert.equal(SRS.stage(c), "mature");
});

test("forgetting resets the card and lowers its ease", () => {
  let c = fresh(), now = T0;
  for (let i = 0; i < 4; i++) { c = SRS.review(c, 2, now); now = c.due; }
  const lapsed = SRS.review(c, 0, now);
  assert.equal(lapsed.reps, 0);
  assert.equal(lapsed.lapses, 1);
  assert.equal(lapsed.ease, 2.3);
  assert.equal(SRS.stage(lapsed), "learning");
});

test("ease never drops below 1.3, and a pass never shortens the interval", () => {
  let c = fresh(), now = T0;
  for (let i = 0; i < 20; i++) { c = SRS.review(c, i % 2 ? 1 : 0, now); now = c.due; }
  assert.equal(c.ease, 1.3);
  c = { ...c, reps: 3, interval: 10 };
  assert.ok(SRS.review(c, 1, now).interval >= 10);
  assert.ok(SRS.review(c, 2, now).interval > 10);
});

test("intervals are capped at a year", () => {
  const c = { ...fresh(), reps: 10, interval: 300, ease: 3 };
  assert.equal(SRS.review(c, 3, T0).interval, 365);
});

test("button previews", () => {
  const c = fresh();
  assert.deepEqual([0, 1, 2, 3].map((g) => SRS.preview(c, g, T0)), ["10m", "1d", "1d", "4d"]);
  assert.equal(SRS.preview({ ...c, reps: 5, interval: 40, ease: 2.5 }, 2, T0), "3mo");
});

test("queue: overdue reviews first, then new cards up to the limit", () => {
  const a = { ...fresh(), id: "a", reps: 2, interval: 3, due: T0 - 2 * DAY };
  const b = { ...fresh(), id: "b", reps: 2, interval: 3, due: T0 - 5 * DAY };
  const later = { ...fresh(), id: "later", reps: 2, interval: 3, due: T0 + DAY };
  const n1 = { ...fresh(), id: "n1", created: T0 - 2 }, n2 = { ...fresh(), id: "n2", created: T0 - 1 };
  assert.deepEqual(SRS.queue([a, n2, later, b, n1], T0, 1).map((c) => c.id), ["b", "a", "n1"]);
});

test("pasting cards in different formats", () => {
  const text = "# physics\nWeight\tW = mg\nDensity;ρ = m/V\nPower - P = IV\nMomentum, p = mv\n\njust a line\n";
  assert.deepEqual(SRS.parseCards(text), [["Weight", "W = mg"], ["Density", "ρ = m/V"], ["Power", "P = IV"], ["Momentum", "p = mv"]]);
});

test("bad grades are rejected", () => {
  assert.throws(() => SRS.review(fresh(), 4, T0), RangeError);
});
