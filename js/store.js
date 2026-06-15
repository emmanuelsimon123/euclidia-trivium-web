/* store.js — persistent state (localStorage) + XP/streak/achievements. Course-based. */
(function () {
  const W = (window.W = window.W || {});
  const KEY = "euclidia.trivium.v1";
  const SCHEMA_VERSION = 2; // bump when the saved-progress shape changes; handle in migrate()

  const DEFAULTS = () => ({
    version: SCHEMA_VERSION,
    // hearts default OFF: gentle "mastery" mode for serious learners (mistakes become practice,
    // never a lockout). Turning hearts ON makes lessons a stakes-bearing "Challenge mode".
    settings: { hearts: false, oratio: false, dailyGoal: 30, sound: true, audioEngine: "system", pronunciation: "ecclesiastical", voiceURI: null },
    stats: { xp: 0, streak: 0, lastActive: null, freezes: 0, dailyXp: {}, achievements: [], totalCorrect: 0, totalAnswered: 0, lessonsDone: 0 },
    lessons: {},   // lessonId -> { seen, c, t, done, best }
    srs: {}        // itemId -> { box, due(dayIdx), reps, lapses, last }
  });

  let state = DEFAULTS();

  function hydrate(p) {                                   // normalize a saved/imported blob into state (deep-merge + migrate)
    if (!p || typeof p !== "object") p = {};
    state = Object.assign(DEFAULTS(), p);
    state.settings = Object.assign(DEFAULTS().settings, p.settings || {});
    state.stats = Object.assign(DEFAULTS().stats, p.stats || {});
    state.lessons = p.lessons || {};
    state.srs = p.srs || {};
    migrate(p.version || 1);
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) hydrate(JSON.parse(raw)); }
    catch (e) { console.warn("load failed", e); state = DEFAULTS(); }
  }
  // forward-migrate older saved progress. Lesson/srs ids are content-keyed, so future content
  // renumbers can remap them here (e.g. state.lessons = remap(state.lessons)) instead of orphaning.
  function migrate(from) {
    if (from >= SCHEMA_VERSION) return;
    // (v1 -> v2: added `version`; shapes are compatible, nothing to remap yet)
    state.version = SCHEMA_VERSION; save();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn("save failed", e); } }

  const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
  const dayIdx = (d = new Date()) => Math.floor(d.getTime() / 86400000);

  function lesson(id) {
    if (!state.lessons[id]) state.lessons[id] = { seen: false, c: 0, t: 0, done: false, best: 0 };
    return state.lessons[id];
  }

  // ---------- mastery (Khan-style, from the per-lesson `best` accuracy we already store) ----------
  // tier 0 = not finished · 1 = passed · 2 = proficient (best>=80) · 3 = mastered (best=100)
  function masteryTier(id) {
    const l = state.lessons[id];
    if (!l || !l.done) return 0;
    const b = l.best || 0;
    return b >= 100 ? 3 : b >= 80 ? 2 : 1;
  }
  function bestOf(id) { return (state.lessons[id] && state.lessons[id].best) || 0; }
  function aggregate(lessonList) {
    let total = 0, done = 0, mastered = 0, sum = 0;
    lessonList.forEach(l => { total++; const t = masteryTier(l.id); if (t >= 1) done++; if (t >= 3) mastered++; sum += bestOf(l.id); });
    return { total, done, mastered, pct: total ? Math.round(sum / total) : 0 };
  }
  function unitMastery(unit) { return aggregate(unit.lessons || []); }
  function courseMastery(course) { const ls = []; (course.units || []).forEach(u => (u.lessons || []).forEach(l => ls.push(l))); return aggregate(ls); }

  function touchStreak() {
    const today = dayKey(), st = state.stats;
    if (st.lastActive === today) return;
    if (st.lastActive) {
      const diff = dayIdx() - dayIdx(new Date(st.lastActive));
      if (diff === 1) st.streak += 1;
      else if (diff > 1) { if (st.freezes > 0 && diff === 2) { st.freezes -= 1; st.streak += 1; } else st.streak = 1; }
    } else st.streak = 1;
    st.lastActive = today;
  }
  function addXp(n) {
    const st = state.stats; st.xp += n;
    const dk = dayKey(); st.dailyXp[dk] = (st.dailyXp[dk] || 0) + n;
    touchStreak();
    if (st.streak > 0 && st.streak % 5 === 0 && st.freezes < 3) st.freezes = Math.min(3, st.freezes + 1);
    checkAchievements(); save();
  }
  function todayXp() { return state.stats.dailyXp[dayKey()] || 0; }

  function recordAnswer(correct, lessonId) {
    const st = state.stats; st.totalAnswered++; if (correct) st.totalCorrect++;
    if (lessonId) { const l = lesson(lessonId); l.t++; if (correct) l.c++; l.seen = true; }
  }

  const ACH = W.ACHIEVEMENTS = [
    { id: "first_lesson", ico: "🎓", name: "First Steps", test: s => s.stats.lessonsDone >= 1 },
    { id: "streak3", ico: "🔥", name: "3-Day Streak", test: s => s.stats.streak >= 3 },
    { id: "streak7", ico: "🔥", name: "Week's Work", test: s => s.stats.streak >= 7 },
    { id: "streak30", ico: "🏛️", name: "Scholar's Resolve", test: s => s.stats.streak >= 30 },
    { id: "xp100", ico: "⚡", name: "100 XP", test: s => s.stats.xp >= 100 },
    { id: "xp1000", ico: "⚡", name: "1,000 XP", test: s => s.stats.xp >= 1000 },
    { id: "perfect", ico: "💯", name: "Perfect Lesson", test: s => s._perfect === true },
    { id: "terms50", ico: "📚", name: "50 Terms Mastered", test: () => termsLearned() >= 50 },
    { id: "unit1", ico: "👑", name: "First Unit Done", test: s => s._unitDone === true },
    { id: "ten_lessons", ico: "⭐", name: "Ten Lessons", test: s => s.stats.lessonsDone >= 10 },
  ];
  function termsLearned() { let n = 0; for (const id in state.srs) if (id.indexOf("term:") === 0 && state.srs[id].box >= 2) n++; return n; }
  function checkAchievements() {
    const newly = [];
    for (const a of ACH) { if (state.stats.achievements.includes(a.id)) continue; try { if (a.test(state)) { state.stats.achievements.push(a.id); newly.push(a); } } catch (e) {} }
    if (newly.length && W.onAchievement) newly.forEach(W.onAchievement);
    return newly;
  }
  function flag(k, v) { state["_" + k] = v; }

  W.store = {
    load, save, state: () => state, settings: () => state.settings, stats: () => state.stats,
    lessons: () => state.lessons, srs: () => state.srs, lesson,
    masteryTier, bestOf, unitMastery, courseMastery,
    addXp, todayXp, recordAnswer, checkAchievements, termsLearned, dayKey, dayIdx,
    markPerfect: v => flag("perfect", v), markUnitDone: v => flag("unitDone", v),
    bumpLessons() { state.stats.lessonsDone++; },
    reset() { state = DEFAULTS(); save(); },
    exportJSON() { return JSON.stringify(state, null, 2); },
    importJSON(t) { hydrate(JSON.parse(t)); save(); },
  };
})();
