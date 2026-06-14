/* srs.js — Leitner-box spaced repetition. Items keyed by a string id. */
(function () {
  const W = (window.W = window.W || {});
  const INTERVAL = [0, 1, 2, 4, 8, 16]; // days to next review, indexed by box 0..5

  function rec(id) {
    const s = W.store.srs();
    if (!s[id]) s[id] = { box: 0, due: W.store.dayIdx(), reps: 0, lapses: 0, last: -1 };
    return s[id];
  }
  function review(id, correct) {
    const r = rec(id);
    r.reps++;
    if (correct) r.box = Math.min(5, r.box + 1);
    else { r.box = Math.max(0, r.box - 2); r.lapses++; }
    r.due = W.store.dayIdx() + INTERVAL[r.box];
    r.last = correct ? 1 : 0;
    W.store.save();
  }
  function known(id) { const r = W.store.srs()[id]; return r && r.box >= 2; }
  function isDue(id) { const r = W.store.srs()[id]; return r ? r.due <= W.store.dayIdx() : false; }

  // all ids that are due (seen before and due today or overdue)
  function dueIds() {
    const s = W.store.srs(), now = W.store.dayIdx(), out = [];
    for (const id in s) if (s[id].reps > 0 && s[id].due <= now) out.push(id);
    return out;
  }
  function wrongIds() {
    const s = W.store.srs(), out = [];
    for (const id in s) if (s[id].last === 0) out.push(id);
    return out;
  }
  function dueCount() { return dueIds().length; }
  // which lesson an item id belongs to ("ex:<lessonId>-eN" or "term:<lessonId>:i")
  function idLesson(id) {
    if (id.indexOf("ex:") === 0) { const m = id.slice(3).match(/^(.*)-e\d+$/); return m ? m[1] : null; }
    if (id.indexOf("term:") === 0) { const m = id.match(/^term:(.+):\d+$/); return m ? m[1] : null; }
    return null;
  }
  function lessonDueIds(lessonId) { return [...new Set(dueIds().concat(wrongIds()))].filter(id => idLesson(id) === lessonId); }
  function dueForLesson(lessonId) { return lessonDueIds(lessonId).length; }
  // weight for session selection: overdue & low-box & recently-wrong rank higher
  function weight(id) {
    const r = W.store.srs()[id];
    if (!r) return 1;
    const over = Math.max(0, W.store.dayIdx() - r.due);
    return 1 + over * 0.5 + (5 - r.box) * 0.4 + (r.last === 0 ? 2 : 0);
  }

  W.srs = { rec, review, known, isDue, dueIds, wrongIds, dueCount, weight, INTERVAL, lessonDueIds, dueForLesson };
})();
