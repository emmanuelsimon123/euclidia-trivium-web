/* content.js — course/unit/lesson access + builds drill questions from authored
 * exercises and key-term definitions. Question objects are consumed by lesson.js. */
(function () {
  const W = (window.W = window.W || {});
  const DATA = (window.COURSE_DATA || { courses: [] });
  const COURSES = DATA.courses.filter(c => !c.hidden);

  // ---------- access ----------
  const courseById = {}; COURSES.forEach(c => courseById[c.id] = c);
  function courses() { return COURSES; }
  function course(id) { return courseById[id]; }
  function units(courseId) { return (courseById[courseId]?.units) || []; }
  function lessons(courseId) { const out = []; units(courseId).forEach(u => (u.lessons || []).forEach(l => out.push(Object.assign({ unit: u.n, courseId }, l)))); return out; }

  // index every lesson + exercise by id (for SRS reconstruction)
  const lessonIndex = {}, exIndex = {};
  COURSES.forEach(c => (c.units || []).forEach(u => (u.lessons || []).forEach(l => {
    lessonIndex[l.id] = { lesson: l, unit: u, course: c };
    (l.exercises || []).forEach(e => exIndex[e.id] = { ex: e, lessonId: l.id, courseId: c.id });
  })));
  function lessonInfo(id) { return lessonIndex[id]; }
  function findLesson(id) { return lessonIndex[id]?.lesson; }

  // ---------- normalization / grading ----------
  function normEng(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[.,;:!?'’"“”()\-—\[\]]/g, " ").replace(/\b(a|an|the)\b/g, " ").replace(/\s+/g, " ").trim();
  }
  // small edit-distance for typo tolerance (capped length keeps it cheap)
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > 3) return 99;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function gradeAccept(accept, input) {
    // 1) raw exact match (case-insensitive, whitespace-collapsed) so answers that ARE punctuation,
    //    symbols, or bare articles ("," "." "'" "a, an, the") grade correctly even though normEng
    //    strips exactly those characters. An exact match is always correct, so this only adds passes.
    const raw = (input || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (raw && (accept || []).some(a => (a || "").replace(/\s+/g, " ").trim().toLowerCase() === raw)) return true;
    // 2) normalized (article/punctuation-insensitive, typo-tolerant) match for prose answers.
    const got = normEng(input);
    if (!got) return false;
    const gw = got.split(" ");
    return (accept || []).some(a => {
      const x = normEng(a); if (!x) return false;
      if (x === got) return true;
      // 3) "fuller answer" leniency: accept a longer reply that CONTAINS the expected answer as
      //    whole words, e.g. answering "Quis habuit agnum?" with "Maria habuit parvum agnum" when
      //    the key answer is just "Maria". Only fires when the reply has MORE words than the answer,
      //    so it never loosens single-word grading; >=4-char guard skips function words.
      if (x.length >= 4) { const xw = x.split(" "); for (let i = 0; gw.length > xw.length && i + xw.length <= gw.length; i++) { let ok = true; for (let k = 0; k < xw.length; k++) if (xw[k] !== gw[i + k]) { ok = false; break; } if (ok) return true; } }
      if (x.length < 6) return false;                 // short answers must match exactly (is->in, to->do no longer pass)
      return lev(x, got) <= (x.length >= 20 ? 2 : 1); // 1 typo for normal words, 2 for long answers
    });
  }

  // ---------- helpers ----------
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
  // parse-tag handling: rename the legacy "—" placeholder, and present tag options in a
  // fixed canonical order (never the sentence's word order → no answer leak).
  const PLACEHOLDER = "(other)";
  const CANON = ["Article", "Noun", "Pronoun", "Adjective", "Verb", "Adverb", "Preposition", "Conjunction", "Interjection", "Numeral", "Participle", "Subject", "Predicate", "Object", "Complement", "Modifier", "Positive", "Comparative", "Superlative"];
  const isDash = t => t === "—" || t === "–" || t === "-";
  function orderTags(tags) {
    const uniq = [...new Set(tags.filter(t => t && !isDash(t) && t !== PLACEHOLDER))];
    if (uniq.every(t => CANON.includes(t))) return uniq.sort((a, b) => CANON.indexOf(a) - CANON.indexOf(b));
    return uniq.sort((a, b) => a.localeCompare(b)); // deterministic, independent of word order
  }
  function sample(arr, k, exclude) { const seen = new Set((exclude || []).map(normEng)); const pool = arr.filter(x => { const n = normEng(x); if (seen.has(n)) return false; seen.add(n); return true; }); return shuffle(pool).slice(0, k); }
  // build a distinct MC choice set (answer + distractors), de-duplicated by normalized text
  function buildChoices(correct, distractorPool, n) {
    const distract = sample(distractorPool, n - 1, [correct]);
    const choices = shuffle([correct, ...distract]);
    return { choices, answer: choices.findIndex(c => normEng(c) === normEng(correct)) };
  }

  // ---------- key-term drills ----------
  function termPool(courseId, exceptTerm) {
    const out = [];
    lessons(courseId).forEach(l => (l.keyTerms || []).forEach(t => { if (t.term !== exceptTerm) out.push(t); }));
    return out;
  }
  function qTermMC(courseId, lessonId, t, idx) {
    const pool = termPool(courseId, t.term).map(x => x.def);
    const { choices, answer } = buildChoices(t.def, pool, 4);
    return { type: "mc", kind: "recognition", srsId: `term:${lessonId}:${idx}`, lessonId,
      label: "What does this term mean?", q: t.term, choices: choices.map(c => ({ text: c })), answer,
      why: `${t.term} — ${t.def}` };
  }
  function qTermType(lessonId, t, idx) {
    return { type: "type", kind: "production", srsId: `term:${lessonId}:${idx}`, lessonId,
      label: "Name the term", q: t.def, accept: [t.term], answerDisplay: t.term, why: `${t.term} — ${t.def}` };
  }
  function termQuestion(courseId, lessonId, t, idx) {
    const box = W.store.srs()[`term:${lessonId}:${idx}`]?.box || 0;
    return box >= 1 && Math.random() < 0.6 ? qTermType(lessonId, t, idx) : qTermMC(courseId, lessonId, t, idx);
  }

  // ---------- authored exercise → question ----------
  function exQuestion(ex, lessonId) {
    const base = { srsId: `ex:${ex.id}`, lessonId, id: ex.id, type: ex.type };
    switch (ex.type) {
      case "mc": {
        const correct = ex.choices[ex.answer];
        const choices = shuffle(ex.choices); // randomize position each render (authored answers skew to #1)
        return Object.assign(base, { kind: "recognition", label: "Choose the answer", q: ex.q, choices: choices.map(t => ({ text: t })), answer: choices.indexOf(correct), why: ex.why });
      }
      case "type": return Object.assign(base, { kind: "production", label: "Type your answer", q: ex.q, accept: ex.accept, answerDisplay: ex.answer, why: ex.why });
      case "cloze": return Object.assign(base, { kind: "production", label: "Fill the blank", q: ex.q, text: ex.text, accept: ex.accept, answerDisplay: ex.answer, why: ex.why });
      case "transform": return Object.assign(base, { kind: "production", label: "Rewrite it", q: ex.q, source: ex.source, accept: ex.accept, answerDisplay: ex.answer, why: ex.why });
      case "order": return Object.assign(base, { kind: "production", label: "Put in order", q: ex.q, tokens: shuffle(ex.tokens), answer: ex.answer, why: ex.why });
      case "parse": {
        const labels = (ex.labels || []).map(l => ({ word: l.word, tag: isDash(l.tag) ? PLACEHOLDER : l.tag }));
        let opts = orderTags(ex.tagset || []);
        // guarantee the option order never equals the sentence's word-order tag sequence (no answer leak)
        const seq = []; labels.forEach(L => { if (L.tag !== PLACEHOLDER && !seq.includes(L.tag)) seq.push(L.tag); });
        let g = 0; while (opts.length >= 2 && JSON.stringify(opts) === JSON.stringify(seq) && g++ < opts.length) opts = opts.slice(1).concat(opts[0]);
        return Object.assign(base, { kind: "production", label: ex.q || "Label each word", sentence: ex.sentence, labels, tagset: opts, placeholder: PLACEHOLDER, why: ex.why });
      }
      case "compose": return Object.assign(base, { kind: "composition", label: "Write it", q: ex.q, model: ex.model, rubric: ex.rubric || [] });
      case "diagram": return Object.assign(base, { kind: "diagram", label: ex.q || "Build the sentence diagram", sentence: ex.sentence, words: ex.words || (ex.sentence || "").split(/\s+/), place: ex.place || {}, why: ex.why });
      default: return null;
    }
  }
  function questionForId(srsId) {
    if (srsId.indexOf("ex:") === 0) { const e = exIndex[srsId.slice(3)]; return e ? exQuestion(e.ex, e.lessonId) : null; }
    if (srsId.indexOf("term:") === 0) {
      const m = srsId.match(/^term:(.+):(\d+)$/); if (!m) return null;
      const info = lessonIndex[m[1]]; if (!info) return null;
      const t = (info.lesson.keyTerms || [])[+m[2]]; if (!t) return null;
      return termQuestion(info.course.id, m[1], t, +m[2]);
    }
    if (srsId.indexOf("para:") === 0) {
      const m = srsId.match(/^para:(.+):(\d+):(\d+)$/); if (!m) return null;
      const t = PARA().find(x => x.id === m[1]); if (!t) return null;
      return cellQ(t, +m[2], +m[3], (W.store.srs()[srsId] || {}).box || 0);
    }
    return null;
  }

  // ---------- paradigm drills (generated from window.PARADIGMS; reuses type/mc, no new exercise type) ----------
  const PARA = () => (window.PARADIGMS && window.PARADIGMS.tables) || [];
  const CASE_FULL = { "N.": "Nominative", "G.": "Genitive", "D.": "Dative", "A.": "Accusative", "Ab.": "Ablative", "V.": "Vocative", "Abl.": "Ablative", "Nom.": "Nominative", "Gen.": "Genitive", "Dat.": "Dative", "Acc.": "Accusative", "Voc.": "Vocative" };
  const LABEL_RE = /^(n|g|d|a|ab|v|nom|gen|dat|acc|abl|voc|1|2|3|1st|2nd|3rd|4th|sing\.?|plur\.?)\.?$/i;
  // a table is drillable when its first column is a label (case/person), not a form
  function isLabelCol(t) { return !!t.headers && (t.headers[0] === "Case" || ((t.rows || []).length > 0 && (t.rows || []).every(r => LABEL_RE.test((r[0] || "").trim())))); }
  function paradigmTables() { return PARA().filter(isLabelCol); }
  const cleanForm = s => (s || "").replace(/-/g, "").trim();
  function isDrillForm(s) { const f = cleanForm(s); return !!f && !/[\s/(),]/.test(f) && f !== "—" && f !== "-"; }
  function tableForms(t) { const out = []; (t.rows || []).forEach(r => { for (let c = 1; c < r.length; c++) if (isDrillForm(r[c])) out.push(cleanForm(r[c])); }); return out; }
  const ctxOf = t => (t.label || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const paraExpand = s => CASE_FULL[(s || "").trim()] || (s || "").trim();
  function cellQ(t, ri, ci, box) {
    const row = (t.rows || [])[ri]; if (!row || !isDrillForm(row[ci])) return null;
    const form = cleanForm(row[ci]), header = (t.headers || [])[ci] || "";
    const prompt = (ctxOf(t) + " — " + paraExpand(row[0]) + " " + header).trim();
    const srsId = `para:${t.id}:${ri}:${ci}`;
    if (box >= 1 && Math.random() < 0.5) return { type: "type", kind: "production", srsId, lessonId: "lat-paradigms", label: "Give the form", q: prompt, accept: [form], answerDisplay: form, why: t.label };
    const { choices, answer } = buildChoices(form, tableForms(t), 4);
    return { type: "mc", kind: "recognition", srsId, lessonId: "lat-paradigms", label: "Pick the correct form", q: prompt, choices: choices.map(x => ({ text: x })), answer, why: t.label };
  }
  function composeParadigm(opts) {
    opts = opts || {};
    const cells = [];
    paradigmTables().forEach(t => (t.rows || []).forEach((r, ri) => { for (let ci = 1; ci < r.length; ci++) if (isDrillForm(r[ci])) cells.push([t, ri, ci]); }));
    if (!cells.length) return [];
    return shuffle(cells).slice(0, opts.size || 14).map(([t, ri, ci]) => cellQ(t, ri, ci, (W.store.srs()[`para:${t.id}:${ri}:${ci}`] || {}).box || 0)).filter(Boolean);
  }

  // ---------- session composer ----------
  function composeLesson(courseId, lessonId, opts) {
    opts = opts || {};
    if (lessonId === "lat-paradigms" && opts.mode !== "review") return composeParadigm(opts);
    if (opts.mode === "review") {
      // surface the weakest / most-overdue items first via the SRS weight(), with light jitter so sessions vary
      const ids = [...new Set(W.srs.dueIds().concat(W.srs.wrongIds()))];
      ids.sort((a, b) => (W.srs.weight(b) + Math.random() * 0.6) - (W.srs.weight(a) + Math.random() * 0.6));
      const qs = [];
      for (const id of ids) { const q = questionForId(id); if (q) qs.push(q); if (qs.length >= (opts.size || 14)) break; }
      return qs;
    }
    const lesson = findLesson(lessonId); if (!lesson) return [];
    if (opts.mode === "skill") { // review just this lesson's due/missed items
      const seen = new Set(), qs = [];
      shuffle(W.srs.lessonDueIds(lessonId)).forEach(id => { if (seen.has(id)) return; seen.add(id); const q = questionForId(id); if (q) qs.push(q); });
      if (!qs.length) (lesson.exercises || []).forEach(ex => { const q = exQuestion(ex, lessonId); if (q) qs.push(q); }); // fallback: replay
      return qs;
    }
    const qs = [];
    // the lesson's own key-term drills + authored exercises (and ONLY those — we deliberately do NOT
    // interleave SRS "due" items from other lessons here; spaced review lives in the explicit Review flow).
    (lesson.keyTerms || []).forEach((t, i) => qs.push(termQuestion(courseId, lessonId, t, i)));
    (lesson.exercises || []).forEach(ex => { const q = exQuestion(ex, lessonId); if (q) qs.push(q); });
    // randomize the question SEQUENCE each session so position can't be memorized (answer choices already
    // shuffle per render). Wrong items still requeue once at the end via the lesson player.
    return shuffle(qs);
  }

  W.content = {
    courses, course, units, lessons, findLesson, lessonInfo,
    composeLesson, questionForId, exQuestion, termQuestion,
    composeParadigm, paradigmTables,
    normEng, gradeAccept, shuffle, sample, buildChoices, DATA, COURSES,
  };
})();
