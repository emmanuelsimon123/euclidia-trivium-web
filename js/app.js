/* app.js — screens, routing, course/unit/lesson path, lesson teaching page, settings, credits. */
(function () {
  const W = (window.W = window.W || {});
  const C = () => W.content;
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach(c => { if (c == null || c === false) return; e.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
    return e;
  }
  const $ = id => document.getElementById(id);
  let activeCourse = "eng";

  function show(name) {
    if (typeof stopSpeech === "function") stopSpeech(); // stop any read-aloud when leaving a screen
    hideGloss();
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const scr = $("screen-" + name); scr.classList.add("active");
    document.body.classList.toggle("in-lesson", name === "lesson");
    $("heartsStat").style.display = (name === "lesson" && W.store.settings().hearts) ? "" : "none"; // hearts only in Challenge mode
    window.scrollTo(0, 0);
    // move focus to the new screen's heading so screen-reader + keyboard users are oriented (content built before show on these screens)
    const ft = scr.querySelector("h1, .page-title, .lesson-title");
    if (ft) { ft.setAttribute("tabindex", "-1"); setTimeout(() => { try { ft.focus({ preventScroll: true }); } catch (e) {} }, 0); }
  }
  function refreshTopbar() {
    const st = W.store.stats(), s = W.store.settings();
    $("streakVal").textContent = st.streak; $("xpVal").textContent = st.xp;
    const fz = $("freezeStat"); if (fz) { fz.style.display = st.freezes > 0 ? "" : "none"; $("freezeVal").textContent = st.freezes; }
    $("streakStat").title = "Daily streak" + (st.freezes ? " · " + st.freezes + " freeze" + (st.freezes > 1 ? "s" : "") + " banked" : "");
    const today = W.store.todayXp(), goal = s.dailyGoal || 30;
    $("goalVal").textContent = Math.min(today, goal);
    $("goalRing").style.strokeDashoffset = (100 - Math.min(1, today / goal) * 100).toFixed(1);
  }

  // ---------- home ----------
  function lessonsOf(courseId) { return C().lessons(courseId); }
  function isDone(id) { return !!(W.store.lessons()[id] && W.store.lessons()[id].done); }
  function currentLesson(courseId) { const ls = lessonsOf(courseId); return (ls.find(l => !isDone(l.id)) || ls[ls.length - 1] || {}).id; }

  function renderHome() {
    renderCourseTabs();
    renderDashboard();
    renderPath();
    const ls = lessonsOf(activeCourse), done = ls.filter(l => isDone(l.id)).length;
    $("heroSub").textContent = `${C().course(activeCourse)?.title}: ${done} of ${ls.length} lessons complete · ${W.srs.dueCount()} due for review.`;
    // Latin-only: paradigm reference + drill deck
    const isLat = activeCourse === "lat";
    ["paradigmsLink", "paradigmDrill"].forEach(id => { const b = $(id); if (b) b.style.display = isLat ? "" : "none"; });
  }
  // ---------- Latin paradigms reference (read-only tables from courses/paradigms.js) ----------
  function renderParadigms() {
    const body = $("paradigmsBody"); if (!body) return; body.innerHTML = "";
    const tables = (window.PARADIGMS && window.PARADIGMS.tables) || [];
    body.appendChild(h("p", { class: "lesson-lead" }, "The forms beneath the readings: declensions, conjugations, and pronouns, with vowel lengths marked. Tap “Practice paradigms” on the home screen to drill them."));
    const bySection = {};
    tables.forEach(t => (bySection[t.section] = bySection[t.section] || []).push(t));
    Object.keys(bySection).forEach(sec => {
      body.appendChild(h("h2", { class: "para-section" }, sec));
      bySection[sec].forEach(t => {
        const tbl = h("table", { class: "para-table" });
        if (t.headers && t.headers.length) tbl.appendChild(h("thead", null, h("tr", null, t.headers.map(hd => h("th", null, hd)))));
        tbl.appendChild(h("tbody", null, (t.rows || []).map(r => h("tr", null, r.map((cell, ci) => h(ci === 0 ? "th" : "td", ci === 0 ? { scope: "row" } : null, cell))))));
        body.appendChild(h("div", { class: "card para-card" }, h("h3", { class: "para-label" }, t.label), tbl, t.note ? h("div", { class: "ex-note" }, t.note) : ""));
      });
    });
  }
  // course-progress strip + prominent "due for review" CTA (Khan-style dashboard)
  function renderDashboard() {
    const box = $("courseDash"); if (!box) return; box.innerHTML = "";
    const course = C().course(activeCourse); if (!course || !course.units || !course.units.length) return;
    const m = W.store.courseMastery(course);
    box.appendChild(h("div", { class: "dash-row" },
      h("div", { class: "dash-stats" },
        h("b", null, m.done + "/" + m.total), " lessons · ", h("b", null, String(m.mastered)), " mastered · ", h("b", null, m.pct + "%"), " mastery"),
      h("div", { class: "dash-bar" }, h("div", { class: "dash-fill", style: "width:" + m.pct + "%" }))));
    const due = W.srs.dueCount();
    if (due > 0) box.appendChild(h("button", { class: "review-cta", onclick: () => W.lesson.start(activeCourse, currentLesson(activeCourse), { mode: "review" }) },
      h("span", { class: "rc-ico" }, "🔁"), h("span", null, h("b", null, due + " due"), " · strengthen your skills")));
  }
  function renderCourseTabs() {
    const box = $("courseTabs"); box.innerHTML = "";
    C().courses().forEach(c => {
      const locked = !c.units || !c.units.length || c.locked;
      const tab = h("button", { class: "course-tab" + (c.id === activeCourse ? " active" : "") + (locked ? " locked" : ""), onclick: () => { if (locked) { toast(c.title + " is coming soon."); return; } activeCourse = c.id; renderHome(); } },
        h("span", { class: "ct-title" }, c.title), h("span", { class: "ct-sub" }, locked ? "Coming soon" : c.subtitle || ""));
      box.appendChild(tab);
    });
  }
  function renderPath() {
    const list = $("pathList"); list.innerHTML = "";
    const course = C().course(activeCourse);
    if (!course || !course.units || !course.units.length) { list.appendChild(h("div", { class: "empty" }, "This course is coming soon.")); return; }
    const cur = currentLesson(activeCourse);
    let lastPart = null;
    course.units.forEach(u => {
      if (u.part && u.part !== lastPart) { lastPart = u.part; list.appendChild(h("div", { class: "part-header" }, u.part)); }
      const um = W.store.unitMastery(u);
      list.appendChild(h("div", { class: "unit-label" },
        h("span", null, `Unit ${u.n} · ${u.title}`, u.ref ? h("span", { class: "unit-ref" }, u.ref) : ""),
        h("span", { class: "unit-prog" }, um.done < um.total ? `${um.done}/${um.total}` : um.mastered === um.total ? "👑 mastered" : "✓ complete")));
      list.appendChild(h("div", { class: "unit-bar" }, h("div", { class: "unit-bar-fill", style: "width:" + um.pct + "%" })));
      u.lessons.forEach((l, i) => {
        const tier = W.store.masteryTier(l.id), done = tier >= 1, current = l.id === cur;
        // mastery upkeep: a finished lesson whose SRS items have come due is flagged for refresh,
        // so "mastered" reflects current retention rather than a single old 100% run.
        const dueN = done ? W.srs.dueForLesson(l.id) : 0;
        const node = h("div", { class: "node tier" + tier + (done ? " done" : "") + (current ? " current" : "") + (dueN ? " review-due" : ""), onclick: () => openLesson(activeCourse, l.id) },
          h("div", { class: "node-medallion" }, tier >= 3 ? "★" : done ? "✓" : (i + 1)),
          h("div", { class: "node-body" }, h("h3", null, l.title, dueN ? h("span", { class: "node-due" }, "🔁 review due") : ""), h("p", null, (done ? "Best " + W.store.bestOf(l.id) + "% · " : "") + (l.concept || l.summary || ""))),
          h("button", { class: (dueN || (current && !done) ? "btn-primary" : "btn-secondary"), onclick: e => { e.stopPropagation(); openLesson(activeCourse, l.id); } }, dueN ? "Review" : done ? "Practice" : current ? "Start" : "Open"));
        list.appendChild(node);
      });
    });
  }

  // ---------- lesson: the Studium method (gated teaching steps -> practice -> mastery) ----------
  // Each lesson is walked as: Praelectio (announce) -> [Oratio] -> Lectio (read) -> Divisio (structure)
  // -> Interpretatio (proposed meaning) -> Comprehensio (the practice player) -> Demonstratio (summary).
  let STUDIUM = null; // { courseId, lessonId, info, steps, i }

  function openLesson(courseId, lessonId) {
    activeCourse = courseId;
    const info = C().lessonInfo(lessonId); if (!info) { toast("Lesson not found."); return; }
    STUDIUM = { courseId, lessonId, info, steps: buildStudiumSteps(info), i: 0 };
    renderStudiumStep(); show("studium"); refreshTopbar();
  }

  function oratioCard() {
    return h("div", { class: "card prayer-card" },
      h("h2", null, "Oratio · Prayer before Study"),
      h("div", { class: "prose" },
        h("p", null, "Ineffable Creator, true source of light and wisdom: pour forth a ray of your brightness upon the darkness of my understanding. Grant me a keen mind to grasp, a sound memory to retain, method and ease in learning, clarity in interpreting, and a rich grace in speaking. Amen."),
        h("p", { class: "ex-note" }, "Adapted from St. Thomas Aquinas, Prayer before Study (Ante Studium). Optional, turn off in Settings.")));
  }

  function renderDivisio(d) {
    d = d || {};
    const box = h("div", null);
    if (d.overview) box.appendChild(h("p", { class: "divisio-overview" }, d.overview));
    if (d.parts && d.parts.length) {
      const ol = h("ol", { class: "divisio-parts" });
      d.parts.forEach(p => ol.appendChild(h("li", null, p.label ? h("b", null, p.label) : "", (p.label && p.detail) ? " — " : "", p.detail || "")));
      box.appendChild(ol);
    }
    if (!d.overview && !(d.parts && d.parts.length)) box.appendChild(h("p", { class: "step-note" }, "Read the passage again and notice how it is organized — its main parts and their order."));
    return card("How this passage is built", box);
  }

  function buildStudiumSteps(info) {
    const l = info.lesson, src = (info.course && info.course.source) || "";
    const steps = [];
    steps.push({ name: "Praelectio", render: (head, body) => {
      head.appendChild(h("div", { class: "section-label" }, `Unit ${info.unit.n} · ${info.unit.title}` + (info.unit.ref ? " · " + info.unit.ref : "")));
      head.appendChild(h("h1", { class: "lesson-title" }, l.title));
      const tier = W.store.masteryTier(l.id), best = W.store.bestOf(l.id), lrec = W.store.lessons()[l.id];
      if (tier >= 1 || (lrec && lrec.seen)) {
        const tname = tier >= 3 ? "Mastered ★" : tier >= 2 ? "Proficient" : tier >= 1 ? "Passed" : "In progress";
        head.appendChild(h("div", { class: "skill-meter tier" + tier }, h("div", { class: "sm-bar" }, h("div", { class: "sm-fill", style: "width:" + best + "%" })), h("div", { class: "sm-label" }, tier >= 1 ? "Your best: " + best + "% · " + tname : tname)));
      }
      head.appendChild(h("p", { class: "step-note" }, "What we are about to study, and where it comes from. The text itself comes next."));
      const c = h("div", null);
      if (src) c.appendChild(h("p", { class: "praelectio-src" }, src));
      if (l.summary) c.appendChild(h("p", { class: "lesson-summary" }, l.summary));
      if (l.lead) c.appendChild(h("div", { class: "lesson-lead" }, l.lead));
      body.appendChild(card("Praelectio", c));
    }});
    if (W.store.settings().oratio) steps.push({ name: "Oratio", render: (head, body) => {
      head.appendChild(h("h1", { class: "lesson-title" }, "Oratio"));
      head.appendChild(h("p", { class: "step-note" }, "A short prayer for guidance before study."));
      body.appendChild(oratioCard());
    }});
    steps.push({ name: "Lectio", render: (head, body) => {
      head.appendChild(h("h1", { class: "lesson-title" }, "Lectio · The Reading"));
      head.appendChild(h("p", { class: "step-note" }, "Read the text carefully — let it speak first. Tap a highlighted word for its meaning, or press 🔊 to hear it read aloud."));
      if (l.original) body.appendChild(h("div", { class: "card reading" },
        h("div", { class: "reading-head" }, h("span", { class: "rd-head-left" }, h("span", { class: "reading-kicker" }, "The Reading"), audioBtn(() => l.original)), src ? h("span", { class: "src-cite" }, src) : ""),
        renderReading(l.original, latGloss(l.id))));
      if (l.keyTerms && l.keyTerms.length) body.appendChild(card("Words to know", h("div", null, l.keyTerms.map(t => h("div", { class: "term" }, h("b", null, t.term), h("span", null, " — " + t.def))))));
    }});
    steps.push({ name: "Divisio", render: (head, body) => {
      head.appendChild(h("h1", { class: "lesson-title" }, "Divisio · The Structure"));
      head.appendChild(h("p", { class: "step-note" }, "How the passage is built — its main parts and their order. This is the framework for the author's intention."));
      body.appendChild(renderDivisio(l.divisio));
    }});
    steps.push({ name: "Interpretatio", render: (head, body) => {
      head.appendChild(h("h1", { class: "lesson-title" }, "Interpretatio · The Proposal"));
      head.appendChild(h("p", { class: "step-note" }, "A proposed reading, argued from the text. Treat it as a claim to test, not a verdict: does the text support it? Where might it be challenged?"));
      if (l.explanation) body.appendChild(card("The proposed meaning", h("div", { class: "prose" }, l.explanation.split(/\n\n+/).map(p => h("p", { html: inlineMd(p) })))));
      if (l.examples && l.examples.length) body.appendChild(card("Examples", h("div", null, l.examples.map(ex => h("div", { class: "example" }, h("div", { class: "ex-text" }, ex.text), ex.note ? h("div", { class: "ex-note" }, ex.note) : "")))));
    }});
    return steps;
  }

  function renderStudiumProgress() {
    const S = STUDIUM, box = $("studiumProgress"); if (!S || !box) return; box.innerHTML = "";
    S.steps.map(s => s.name).concat(["Comprehensio", "Demonstratio"]).forEach((name, idx) => {
      const cls = idx < S.i ? "done" : idx === S.i ? "current" : "upcoming";
      box.appendChild(h("div", { class: "studium-step " + cls, role: "listitem" }, h("span", { class: "ss-n" }, String(idx + 1)), h("span", { class: "ss-name" }, name)));
    });
  }

  function renderStudiumStep() {
    const S = STUDIUM; if (!S) return;
    const step = S.steps[S.i];
    const head = $("studiumHead"); head.innerHTML = "";
    const body = $("studiumBody"); body.innerHTML = "";
    head.appendChild(h("div", { class: "studium-kicker" }, (S.i + 1) + " · " + step.name));
    step.render(head, body);
    if (S.i === 0) {                                          // returning-learner shortcut: jump past the teaching steps
      const dueN = W.srs.dueForLesson(S.lessonId), done = isDone(S.lessonId);
      if (done || dueN) {
        const acts = h("div", { class: "skill-actions", style: "margin-top:16px" },
          h("button", { class: "btn-secondary", onclick: () => startLesson(S.courseId, S.lessonId) }, (done ? "Skip to practice" : "Start practice") + " ▸"));
        if (dueN) acts.appendChild(h("button", { class: "btn-secondary", onclick: () => startLesson(S.courseId, S.lessonId, { mode: "skill" }) }, "🔁 Review this skill (" + dueN + ")"));
        body.appendChild(acts);
      }
    }
    renderStudiumProgress();
    $("studiumBack").style.visibility = S.i === 0 ? "hidden" : "";
    $("studiumNext").textContent = (S.i >= S.steps.length - 1) ? "Begin practice ▸" : "Next ▸";
  }

  function studiumFocusHead() { const ft = $("studiumHead").querySelector("h1, .lesson-title"); if (ft) { ft.setAttribute("tabindex", "-1"); setTimeout(() => { try { ft.focus({ preventScroll: true }); } catch (e) {} }, 0); } }
  function studiumNext() {
    const S = STUDIUM; if (!S) return;
    if (S.i >= S.steps.length - 1) { startLesson(S.courseId, S.lessonId); return; } // Interpretatio -> Comprehensio (practice)
    S.i++; renderStudiumStep(); window.scrollTo(0, 0); studiumFocusHead();
  }
  function studiumBack() {
    const S = STUDIUM; if (!S || S.i === 0) return;
    S.i--; renderStudiumStep(); window.scrollTo(0, 0); studiumFocusHead();
  }
  function startLesson(courseId, lessonId, opts) { W.lesson.start(courseId, lessonId, opts || {}); }
  function nextLesson(courseId, lessonId) {
    const ls = lessonsOf(courseId); const idx = ls.findIndex(l => l.id === lessonId);
    const nxt = ls[idx + 1];
    if (nxt) openLesson(courseId, nxt.id); else { renderHome(); show("home"); toast("Unit complete! 🎉"); }
  }
  function onLessonComplete(courseId, lessonId) {
    const info = C().lessonInfo(lessonId);
    if (info && info.unit.lessons.every(l => isDone(l.id))) W.store.markUnitDone(true);
    W.store.checkAchievements();
  }
  function card(title, body) { return h("div", { class: "card" }, title ? h("h2", null, title) : "", body || ""); }
  function inlineMd(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/•/g, "&bull;"); }

  // ---------- reading typography: STRUCTURE the verbatim source (never alters the words) ----------
  // A plain-language glossary for archaic / technical terms in the readings (tap or focus to define).
  const GLOSS = {
    "accidence": "the part of grammar dealing with the forms of words and how they change",
    "syntax": "the part of grammar dealing with how words combine into sentences",
    "noun substantive": "a noun, a word that names a thing", "substantive": "a noun, a word that names a thing",
    "appellative": "a common noun, a name shared by every member of a class",
    "inflexion": "a change in a word's ending to show its grammatical role (also spelled inflection)",
    "inflection": "a change in a word's ending to show its grammatical role",
    "genitive": "the case showing possession or 'of' (in English, the 's form)",
    "nominative": "the case of the subject, the doer of the action",
    "accusative": "the case of the direct object, the receiver of the action",
    "dative": "the case of the indirect object, often 'to' or 'for' someone",
    "ablative": "a Latin case used for 'by', 'with', or 'from'",
    "vocative": "the case used when directly addressing someone",
    "preterite": "the simple past tense (he walked, he ran)",
    "participle": "a verb form used as an adjective (a running stream, a broken cup)",
    "conjunction": "a word that joins words or clauses (and, but, that)",
    "interjection": "a word expressing sudden feeling (oh!, alas!)",
    "preposition": "a word marking a relation (in, on, over, from)",
    "copula": "a linking verb, chiefly 'to be', joining subject and predicate",
    "predicate": "what is said about the subject, usually the verb and what follows",
    "antecedent": "the noun that a pronoun refers back to",
    "declension": "the set of case-forms of a noun, pronoun, or adjective",
    "conjugation": "the set of forms a verb takes for tense, person, and number",
    "subjunctive": "a verb mood for wishes, conditions, or things not asserted as fact",
    "indicative": "the ordinary verb mood that states a fact",
    "imperative": "the verb mood of commands",
    "infinitive": "the basic 'to' form of a verb (to run, to be)",
    "gerund": "a verb form in -ing used as a noun (running is healthy)",
    "diphthong": "two vowels sounded together as one glide (oi in oil)",
    "abstract": "naming a quality or idea, not a physical thing (courage, redness)",
    "concrete": "naming a thing that really exists and can be perceived (iron, rose)",
    "predicative": "used after a linking verb to describe the subject (the sky is blue)",
    "attributive": "placed directly before a noun to describe it (the blue sky)",
    "apposition": "a noun placed beside another to explain it (Paul, the apostle)",
    "periphrasis": "a roundabout way of saying something, circumlocution",
    "exposition": "writing that explains or informs",
    "narration": "writing that tells a story or what happened",
    "rhetoric": "the art of using language effectively and persuasively",
    "coherence": "the quality of parts being clearly connected and flowing logically",
    "emphasis": "giving prominence to the most important parts",
    "proposition": "a statement put forward to be discussed or proved",
    "notion": "an idea or conception in the mind",
  };
  const GLOSS_KEYS = Object.keys(GLOSS).sort((a, b) => b.length - a.length); // longest first (multi-word wins)
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escAttr = s => esc(s).replace(/"/g, "&quot;");
  // set off the books' own example word-lists, e.g. "(Tree, flower, soldier, house.)"
  function wrapExamples(html) { return html.replace(/\(([A-Z][a-z][\w'’-]*(?:,\s*[\w'’-]+){2,}\.?)\)/g, '<span class="rd-eg">($1)</span>'); }
  // wrap the FIRST occurrence of each glossary term in this reading (skip if inside an existing tag)
  function wrapGloss(html, seen) {
    for (const term of GLOSS_KEYS) {
      if (seen.has(term)) continue;
      const e = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), wordish = /^[\w][\w ]*[\w]$/.test(term);
      const re = new RegExp((wordish ? "\\b" : "") + "(" + e + ")" + (wordish ? "\\b" : ""), "ig"); // global: find the first VALID hit
      let m;
      while ((m = re.exec(html))) {
        const off = m.index, before = html.slice(0, off);
        if (before.lastIndexOf("<") > before.lastIndexOf(">")) continue;                                       // inside a tag
        if ((before.match(/<span/g) || []).length > (before.match(/<\/span>/g) || []).length) continue;       // inside an existing gloss span (no nesting)
        html = html.slice(0, off) + '<button type="button" class="gloss" aria-label="' + escAttr(m[1] + ": " + GLOSS[term]) + '" data-def="' + escAttr(GLOSS[term]) + '">' + m[1] + "</button>" + html.slice(off + m[1].length);
        seen.add(term); break;
      }
    }
    return html;
  }
  function tryHeading(block) {
    let m = block.match(/^([§�]\s*\d+\s*\.\s+[A-Z][^\n]*?\.)\s*([\s\S]*)$/);     // Arnold "§ 3. DIVISION OF SUBSTANTIVES." (no $ — avoids "$ 5." dollar-amount false positives)
    if (m) return { head: m[1].replace(/\s+/g, " ").trim(), rest: m[2].trim() };
    m = block.match(/^(\d{1,3}\.\s+[A-Z][^.\n]{2,70}\.)\s*[—-]?\s*([\s\S]*)$/);          // Brooks "80. General Principles of Composition."
    if (m) return { head: m[1].trim(), rest: m[2].trim() };
    return null;
  }
  // Latin reading words become tappable: every content word maps to its dictionary form, meaning, and
  // parse (Most's own gloss when the word is a vocab item). Built from courses/latin-gloss.js.
  function latGloss(id) { return (typeof window !== "undefined" && window.LAT_GLOSS && window.LAT_GLOSS[id]) || null; }
  const stripLatLower = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function wrapLatinWords(html, gloss) {
    return html.replace(/[A-Za-zÀ-ɏ]+/g, w => {
      const e = gloss[stripLatLower(w)];
      if (!e) return w;
      const def = (e.l ? e.l + " — " : "") + e.d + (e.p ? "  ·  " + e.p : "");
      return '<button type="button" class="gloss lat-gloss" aria-label="' + escAttr(w + ": " + def) + '" data-def="' + escAttr(def) + '">' + w + "</button>";
    });
  }
  function renderBody(wrap, text, seen, gloss) {
    if (/^[A-Za-z](\s+[A-Za-z'&.]+){5,}\.?$/.test(text) && text.length < 100) { wrap.appendChild(h("div", { class: "rd-letters" }, text)); return; } // alphabet / letter row
    const wrapFn = gloss ? seg => wrapLatinWords(esc(seg), gloss) : seg => wrapGloss(wrapExamples(esc(seg)), seen);
    text.split(/(?=\s\([a-h]\)\s)/).forEach(seg => {                                      // break out lettered sub-notes (a)(b)…; leaves inline (1)(2) digits alone
      seg = seg.trim(); if (!seg) return;
      const n = seg.match(/^\(([a-h])\)\s([\s\S]*)$/);
      if (n) wrap.appendChild(h("div", { class: "rd-note" }, h("span", { class: "rd-badge" }, n[1]), h("span", { html: wrapFn(n[2]) })));
      else wrap.appendChild(h("p", { html: wrapFn(seg) }));
    });
  }
  function renderReading(text, gloss) {
    const wrap = h("div", { class: "prose original" }), seen = new Set();
    (text || "").split(/\n\n+/).map(b => b.trim()).filter(Boolean).forEach(block => {
      const hd = tryHeading(block);
      if (hd) { wrap.appendChild(h("h4", { class: "rd-h" }, hd.head)); if (hd.rest) renderBody(wrap, hd.rest, seen, gloss); }
      else renderBody(wrap, block, seen, gloss);
    });
    return wrap;
  }
  // ---------- glossary popover (works for tap, keyboard, and mouse — not just hover) ----------
  let glossPop = null;
  function showGloss(el) {
    if (!glossPop) { glossPop = h("div", { id: "glossPop", class: "gloss-pop", role: "tooltip" }); document.body.appendChild(glossPop); }
    glossPop.textContent = el.getAttribute("data-def") || "";
    glossPop.style.maxWidth = Math.min(300, window.innerWidth - 24) + "px";
    glossPop.style.left = "0px"; glossPop.style.top = "0px"; glossPop.classList.add("show");
    const r = el.getBoundingClientRect(), pr = glossPop.getBoundingClientRect();
    glossPop.style.left = Math.min(Math.max(8, r.left), window.innerWidth - pr.width - 8) + "px";
    glossPop.style.top = (r.top - pr.height - 8 < 8 ? r.bottom + 8 : r.top - pr.height - 8) + "px";
  }
  function hideGloss() { if (glossPop) glossPop.classList.remove("show"); }
  function wireGloss() {
    const near = e => e.target && e.target.closest && e.target.closest(".gloss");
    document.addEventListener("click", e => { const g = near(e); if (g) { e.preventDefault(); showGloss(g); } else if (!(e.target.closest && e.target.closest("#glossPop"))) hideGloss(); });
    document.addEventListener("focusin", e => { const g = near(e); if (g) showGloss(g); else hideGloss(); });
    document.addEventListener("mouseover", e => { const g = near(e); if (g) showGloss(g); });
    document.addEventListener("mouseout", e => { const g = near(e); if (g && g !== document.activeElement) hideGloss(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") hideGloss(); }, true);
  }

  // ---------- read-aloud (offline, browser Web Speech API) ----------
  const TTS = typeof window !== "undefined" && window.speechSynthesis;
  let VOICES = [];
  function loadVoices() { try { VOICES = (TTS && speechSynthesis.getVoices()) || []; } catch (e) { VOICES = []; } }
  if (TTS) { loadVoices(); try { speechSynthesis.addEventListener("voiceschanged", loadVoices); } catch (e) {} }
  function enVoices() { if (!VOICES.length) loadVoices(); const en = VOICES.filter(v => /^en[-_]?/i.test(v.lang)); return en.length ? en : VOICES; }
  function pickVoice() {
    const pool = enVoices(); if (!pool.length) return null;
    const want = W.store.settings().voiceURI;
    if (want) { const v = pool.find(x => x.voiceURI === want) || VOICES.find(x => x.voiceURI === want); if (v) return v; }
    return pool.find(v => /natural|neural|online|premium|enhanced|google|siri/i.test(v.name))  // prefer modern neural voices
      || pool.find(v => !/david|zira|mark|hazel|sapi/i.test(v.name))                            // else any non-robotic default
      || pool[0];
  }
  function stopSpeech() { try { if (TTS) speechSynthesis.cancel(); } catch (e) {} }
  function speak(text) {
    if (!TTS) return null;
    stopSpeech();
    const u = new SpeechSynthesisUtterance((text || "").replace(/[§$�]/g, " ").replace(/\s+/g, " ").trim());
    const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } u.rate = 0.96; u.pitch = 1;
    speechSynthesis.speak(u); return u;
  }
  function audioBtn(getText) {
    if (!TTS) return ""; // gracefully omit when the browser has no speech synthesis
    let on = false;
    const b = h("button", { class: "audio-btn", title: "Read aloud", "aria-label": "Read this passage aloud", "aria-pressed": "false" }, "🔊");
    const reset = () => { on = false; b.classList.remove("on"); b.textContent = "🔊"; b.setAttribute("aria-pressed", "false"); b.setAttribute("aria-label", "Read this passage aloud"); };
    b.addEventListener("click", () => {
      if (on) { stopSpeech(); reset(); return; }
      const u = speak(getText()); if (!u) return;
      u.onend = reset; u.onerror = reset;
      on = true; b.classList.add("on"); b.textContent = "⏹"; b.setAttribute("aria-pressed", "true"); b.setAttribute("aria-label", "Stop reading");
    });
    return b;
  }

  // ---------- settings ----------
  function renderSettings() {
    const s = W.store.settings(), st = W.store.stats(), body = $("settingsBody"); body.innerHTML = "";
    body.appendChild(toggle("Challenge mode (hearts)", "Off by default, so a wrong answer just becomes practice and never ends a lesson. Turn on for 3 hearts and real stakes: run out and the round ends.", s.hearts, v => { s.hearts = v; W.store.save(); }));
    body.appendChild(toggle("Prayer before study (Oratio)", "Adds St. Thomas Aquinas's short Prayer before Study as a step at the start of each lesson. Off by default.", s.oratio, v => { s.oratio = v; W.store.save(); }));
    body.appendChild(numRow("Daily goal (XP)", "Your target XP per day.", s.dailyGoal, v => { s.dailyGoal = Math.max(10, v | 0); W.store.save(); refreshTopbar(); }));
    body.appendChild(h("div", { class: "set-row" }, h("div", null, h("div", { class: "label" }, "Streak freezes"), h("div", { class: "desc" }, "Banked automatically every 5-day streak (max 3). A freeze saves your streak if you miss a single day.")), h("div", { class: "freeze-count" }, "❄ " + (st.freezes || 0))));
    if (TTS) {
      loadVoices();
      const sel = h("select", { class: "num-input", style: "width:auto;max-width:230px" });
      sel.appendChild(h("option", { value: "" }, "Auto (best available)"));
      enVoices().forEach(v => { const o = h("option", { value: v.voiceURI }, v.name + (/(natural|neural|online|premium|enhanced)/i.test(v.name) ? " ✦" : "")); if (s.voiceURI === v.voiceURI) o.setAttribute("selected", "selected"); sel.appendChild(o); });
      sel.addEventListener("change", () => { s.voiceURI = sel.value || null; W.store.save(); speak("This is the reading voice you have chosen."); });
      body.appendChild(h("div", { class: "set-row" }, h("div", null, h("div", { class: "label" }, "Reading voice"), h("div", { class: "desc" }, "Voice for the read-aloud button. Voices marked ✦ are natural/neural and sound far less robotic. For the best voices use Microsoft Edge, or install more in Windows Settings (Time & language, Speech).")), sel));
    }
    const ach = h("div", { class: "badge-grid" });
    W.ACHIEVEMENTS.forEach(a => { const earned = W.store.stats().achievements.includes(a.id); ach.appendChild(h("div", { class: "badge" + (earned ? " earned" : "") }, h("div", { class: "bico" }, a.ico), h("div", { class: "bname" }, a.name))); });
    body.appendChild(h("div", { class: "card" }, h("h2", null, "Achievements"), ach));
    body.appendChild(h("div", { class: "card" }, h("h2", null, "Your data"),
      h("p", { class: "q-sub" }, "Progress is saved in this browser. Export a backup or move it to another device."),
      h("div", { class: "row-btns" },
        h("button", { class: "btn-secondary", onclick: exportData }, "⬇ Export progress"),
        h("button", { class: "btn-secondary", onclick: importData }, "⬆ Import progress"),
        h("button", { class: "btn-secondary danger", onclick: () => { if (confirm("Erase ALL progress?")) { W.store.reset(); refreshTopbar(); renderSettings(); toast("Progress reset."); } } }, "⟲ Reset all"))));
  }
  function toggle(label, desc, val, fn) { const inp = h("input", { type: "checkbox" }); inp.checked = val; inp.addEventListener("change", () => fn(inp.checked)); return h("div", { class: "set-row" }, h("div", null, h("div", { class: "label" }, label), h("div", { class: "desc" }, desc)), h("label", { class: "switch" }, inp, h("span", { class: "slider" }))); }
  function numRow(label, desc, val, fn) { const inp = h("input", { class: "num-input", type: "number", min: "10", step: "10" }); inp.value = val; inp.addEventListener("change", () => fn(parseInt(inp.value, 10))); return h("div", { class: "set-row" }, h("div", null, h("div", { class: "label" }, label), h("div", { class: "desc" }, desc)), inp); }
  function exportData() { const blob = new Blob([W.store.exportJSON()], { type: "application/json" }); const a = h("a", { href: URL.createObjectURL(blob), download: "euclidia-trivium-progress.json" }); document.body.appendChild(a); a.click(); a.remove(); }
  function importData() { const inp = h("input", { type: "file", accept: ".json" }); inp.addEventListener("change", () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { W.store.importJSON(r.result); refreshTopbar(); renderSettings(); toast("Imported."); } catch (e) { toast("Import failed."); } }; r.readAsText(f); }); inp.click(); }

  // ---------- credits ----------
  function renderCredits() {
    const body = $("creditsBody"); body.innerHTML = "";
    body.appendChild(h("div", { class: "card" },
      h("p", null, "Euclidia Trivium is free and open. Its lessons are built on public-domain works whose copyright has long since expired, so the material can be shared with everyone."),
      h("h3", null, "English Grammar"),
      h("p", null, "Thomas Kerchever Arnold, ", h("em", null, "An English Grammar for Classical Schools"), " (London, 1848). Public domain. Explanations are written fresh for modern learners; the author's original wording is shown verbatim within each lesson."),
      h("h3", null, "Composition & Rhetoric"),
      h("p", null, "Stratton D. Brooks & Marietta Hubbard, ", h("em", null, "Composition-Rhetoric"), " (American Book Company, 1905). Public domain."),
      h("p", { class: "q-sub", style: "margin-top:18px" }, "A Euclidia product · euclidiamath.com")));
  }

  // ---------- printable progress summary (no backend; nothing leaves the browser) ----------
  function printSummary() {
    const s = W.store.settings();
    const name = prompt("Your name for the summary (optional):", s.learnerName || "");
    if (name === null) return;                       // cancelled
    s.learnerName = name; W.store.save();
    const old = $("printArea"); if (old) old.remove();
    const st = W.store.stats();
    const rows = C().courses().filter(c => c.units && c.units.length).map(c => {
      const m = W.store.courseMastery(c);
      return h("tr", null, h("td", null, c.title), h("td", null, m.done + " / " + m.total), h("td", null, String(m.mastered)), h("td", null, m.pct + "%"));
    });
    const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const area = h("div", { id: "printArea", class: "print-area" },
      h("div", { class: "ps-brand" }, "Eucli", h("em", null, "dia"), " · Trivium"),
      h("h1", { class: "ps-title" }, "Progress Summary"),
      h("div", { class: "ps-meta" }, (name ? name + " · " : "") + dateStr),
      h("table", { class: "ps-table" },
        h("thead", null, h("tr", null, h("th", null, "Course"), h("th", null, "Lessons"), h("th", null, "Mastered"), h("th", null, "Mastery"))),
        h("tbody", null, rows)),
      h("div", { class: "ps-stats" }, "Total XP " + (st.xp || 0) + "  ·  Streak " + (st.streak || 0) + " day" + (st.streak === 1 ? "" : "s")),
      h("div", { class: "ps-foot" }, "Euclidia Writing & Grammar · euclidiamath.com"));
    document.body.appendChild(area);
    window.print();
  }

  // ---------- toast / achievements ----------
  let tt; function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2200); }
  W.onAchievement = a => toast("🏆 " + a.name);

  function boot() {
    W.store.load(); W.lesson.wire(); wireGloss();
    $("homeBtn").addEventListener("click", () => { renderHome(); show("home"); refreshTopbar(); });
    $("settingsBtn").addEventListener("click", () => { renderSettings(); show("settings"); });
    $("continueBtn").addEventListener("click", () => openLesson(activeCourse, currentLesson(activeCourse)));
    $("reviewLink").addEventListener("click", () => { if (!W.srs.dueCount()) { toast("Nothing due yet — keep learning!"); return; } W.lesson.start(activeCourse, currentLesson(activeCourse), { mode: "review" }); });
    $("creditsLink").addEventListener("click", () => { renderCredits(); show("credits"); });
    { const pl = $("paradigmsLink"); if (pl) pl.addEventListener("click", () => { renderParadigms(); show("paradigms"); }); }
    { const pd = $("paradigmDrill"); if (pd) pd.addEventListener("click", () => W.lesson.start("lat", "lat-paradigms")); }
    { const sl = $("summaryLink"); if (sl) sl.addEventListener("click", printSummary); }
    $("studiumNext").addEventListener("click", studiumNext);
    $("studiumBack").addEventListener("click", studiumBack);
    $("studiumExit").addEventListener("click", () => { renderHome(); show("home"); refreshTopbar(); });
    document.addEventListener("keydown", e => {                       // arrow-key navigation through the Studium steps
      if (!$("screen-studium").classList.contains("active")) return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); studiumNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); studiumBack(); }
    });
    document.querySelectorAll("[data-nav]").forEach(b => b.addEventListener("click", () => { const t = b.dataset.nav; if (t === "home") { renderHome(); show("home"); } else show(t); refreshTopbar(); }));
    document.addEventListener("keydown", e => {
      if (!document.body.classList.contains("in-lesson")) return;
      const ae = document.activeElement, typing = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");
      if (e.key === "Enter") {
        if (ae && ae.closest && ae.closest(".diagram, .dg-bank, .parse-word")) return; // diagram/parse controls handle Enter/Space themselves
        e.preventDefault();
        const fb = $("feedbackBar");
        if (fb.classList.contains("show")) $("fbContinue").click();
        else if (!$("checkBtn").disabled) $("checkBtn").click();
      } else if (!typing && /^[1-9]$/.test(e.key)) {
        const b = document.querySelectorAll("#questionArea .choice")[+e.key - 1]; if (b) b.click();
      }
    });
    renderHome(); show("home"); refreshTopbar();
  }

  W.app = { show, refreshTopbar, toast, openLesson, nextLesson, startLesson, onLessonComplete, renderHome };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
