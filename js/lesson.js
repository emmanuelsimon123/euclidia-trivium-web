/* lesson.js — lesson player: renders/grades every exercise type; hearts, combo, XP, summary. */
(function () {
  const W = (window.W = window.W || {});
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
  const qArea = () => $("questionArea");
  const START_HEARTS = 3; // hearts in Challenge mode (off by default)
  let L = null, mcSel = -1;

  function start(courseId, lessonId, opts) {
    opts = opts || {};
    const queue = W.content.composeLesson(courseId, lessonId, opts);
    if (!queue.length) { W.app.toast("Nothing to practice here yet."); return; }
    const hearts = (W.store.settings().hearts && opts.mode !== "practice" && opts.mode !== "review" && opts.mode !== "skill") ? START_HEARTS : Infinity;
    L = { courseId, lessonId, opts, queue, i: 0, hearts, combo: 0, maxCombo: 0, correct: 0, answered: 0, wrongQs: [], requeued: false, start: Date.now(), current: null, st: null, graded: false };
    W.app.show("lesson"); renderHearts(); next();
  }

  function renderHearts() {
    const box = $("lessonHearts");
    if (L.hearts === Infinity) { box.innerHTML = ""; return; } // gentle mode: no hearts UI clutter
    box.innerHTML = ""; for (let i = 0; i < START_HEARTS; i++) box.appendChild(h("span", { class: i < L.hearts ? "" : "lost" }, "❤"));
  }
  function renderCombo() {
    const c = $("comboChip"); if (!c) return;
    if (L.combo >= 2) { c.textContent = "🔥 ×" + L.combo; c.className = "combo-chip show"; void c.offsetWidth; c.classList.add("pop"); }
    else c.className = "combo-chip";
  }
  function progress() { $("lessonProgress").style.width = Math.round((L.i / L.queue.length) * 100) + "%"; }

  function teardown() { if (L && L.st && typeof L.st.cleanup === "function") { L.st.cleanup(); L.st.cleanup = null; } } // run on every lesson exit so the parse document-click listener never leaks
  function next() {
    teardown(); L.graded = false; L.st = null; mcSel = -1; hideFeedback();
    if (L.i >= L.queue.length) return finish();
    progress();
    const q = L.queue[L.i]; L.current = q;
    const area = qArea(); area.innerHTML = "";
    area.appendChild(h("div", { class: "q-prompt" }, q.label || ""));
    (RENDER[q.type] || RENDER.mc)(q, area);
    setCheck(false, q.type === "compose" ? "Reveal model" : "Check");
  }
  function setCheck(enabled, text) { const b = $("checkBtn"); b.textContent = text || "Check"; b.disabled = !enabled; b.style.display = ""; }

  // ---------- renderers ----------
  const RENDER = {
    mc(q, area) {
      if (q.q) area.appendChild(h("div", { class: "q-title" }, q.q));
      const wrap = h("div", { class: "choices" });
      q.choices.forEach((c, idx) => {
        const btn = h("button", { class: "choice", onclick: () => selectMC(idx, btn, wrap) }, h("span", { class: "kbd" }, idx + 1), h("span", null, c.text));
        wrap.appendChild(btn);
      });
      area.appendChild(wrap);
    },
    type(q, area) {
      if (q.q) area.appendChild(h("div", { class: "q-title" }, q.q));
      mkInput(area, "type your answer…");
    },
    cloze(q, area) {
      if (q.q) area.appendChild(h("div", { class: "q-sub" }, q.q));
      const parts = (q.text || "").split(/_{2,}|___/);
      const sent = h("div", { class: "blank-sentence" }, parts[0] || "", h("span", { class: "blank" }, "?"), parts[1] || "");
      area.appendChild(sent);
      mkInput(area, "fill the blank…");
    },
    transform(q, area) {
      area.appendChild(h("div", { class: "q-title" }, q.q));
      area.appendChild(h("div", { class: "q-target" }, h("span", { class: "big-quote" }, q.source)));
      mkInput(area, "rewrite here…", true);
    },
    order(q, area) {
      if (q.q) area.appendChild(h("div", { class: "q-title" }, q.q));
      const ans = h("div", { class: "wb-answer", "aria-live": "polite", "aria-label": "Your sentence" }), bank = h("div", { class: "wb-bank", "aria-label": "Word bank" });
      const placed = [];
      function render() {
        ans.innerHTML = ""; placed.forEach((t, i) => ans.appendChild(h("button", { class: "tile", type: "button", "aria-label": "Remove " + t.w, onclick: () => { placed.splice(i, 1); render(); } }, t.w)));
        bank.querySelectorAll(".tile").forEach((b, i) => { const used = placed.some(p => p.k === i); b.classList.toggle("used", used); b.disabled = used; });
        setCheck(placed.length === q.tokens.length);
      }
      q.tokens.forEach((w, i) => bank.appendChild(h("button", { class: "tile", type: "button", onclick: () => { if (placed.some(p => p.k === i)) return; placed.push({ w, k: i }); render(); } }, w)));
      area.appendChild(ans); area.appendChild(bank);
      L.st = { get: () => placed.map(p => p.w) };
      render();
    },
    parse(q, area) {
      area.appendChild(h("div", { class: "q-sub" }, "Tap each word and choose its label."));
      const row = h("div", { class: "parse-row" });
      const picks = {};
      function closeMenus(exceptI) { row.querySelectorAll(".parse-word.open").forEach(c => { if (c.dataset.i !== String(exceptI)) { c.classList.remove("open"); const b = c.querySelector(".pw-tag"); if (b) b.setAttribute("aria-expanded", "false"); } }); }
      q.labels.forEach((lab, i) => {
        const fixed = lab.tag === q.placeholder;
        const cell = h("div", { class: "parse-word" + (fixed ? " fixed" : ""), "data-i": i }, h("span", { class: "pw" }, lab.word));
        if (fixed) { cell.appendChild(h("span", { class: "pw-tag dim" }, "·")); row.appendChild(cell); return; }
        const menuId = "pwm" + i;
        const opts = q.tagset.map(t => h("button", { class: "pw-opt", type: "button", onclick: () => choose(t) }, t));
        const menu = h("div", { class: "pw-menu", id: menuId }, opts);
        function open() { closeMenus(); cell.classList.add("open"); btn.setAttribute("aria-expanded", "true"); if (opts[0]) setTimeout(() => opts[0].focus(), 0); }
        function close() { cell.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
        function choose(t) { picks[i] = t; btn.textContent = t; btn.classList.add("chosen"); close(); checkReady(); btn.focus(); }
        const btn = h("button", { class: "pw-tag", type: "button", "aria-haspopup": "true", "aria-expanded": "false", "aria-controls": menuId, "aria-label": "Label for " + lab.word,
          onclick: e => { e.stopPropagation(); cell.classList.contains("open") ? close() : open(); },
          onkeydown: e => { if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } else if (e.key === "Escape") close(); } }, "label ▾");
        menu.addEventListener("keydown", e => {
          const idx = opts.indexOf(document.activeElement);
          if (e.key === "ArrowDown") { e.preventDefault(); (opts[idx + 1] || opts[0]).focus(); }
          else if (e.key === "ArrowUp") { e.preventDefault(); (opts[idx - 1] || opts[opts.length - 1]).focus(); }
          else if (e.key === "Escape") { e.preventDefault(); close(); btn.focus(); }
        });
        cell.appendChild(btn); cell.appendChild(menu); row.appendChild(cell);
      });
      area.appendChild(row);
      const onDoc = () => closeMenus(); document.addEventListener("click", onDoc);
      const selectable = q.labels.map((l, i) => i).filter(i => q.labels[i].tag !== q.placeholder);
      function checkReady() { setCheck(selectable.every(i => picks[i] != null)); }
      L.st = { get: () => picks, selectable, labels: q.labels, cleanup: () => document.removeEventListener("click", onDoc) };
    },
    compose(q, area) {
      area.appendChild(h("div", { class: "q-title" }, q.q));
      const ta = h("textarea", { class: "text-input", rows: "4", placeholder: "write your answer…" });
      ta.addEventListener("input", () => setCheck(ta.value.trim().length > 3, "Reveal model"));
      area.appendChild(ta);
      L.st = { get: () => ta.value, reveal: false };
      setTimeout(() => ta.focus(), 30);
    },
    // Reed-Kellogg style diagram: place each word on the baseline (subject | verb | object/complement) or on a modifier rail beneath its head.
    diagram(q, area) {
      const ZL = { subject: "Subject", verb: "Verb", object: "Direct object", complement: "Complement", subjMod: "Subject modifiers", verbMod: "Verb modifiers", objMod: "Object modifiers" };
      area.appendChild(h("div", { class: "q-sub" }, "Select a word, then choose where it belongs. Subject, verb, and object sit on the line; modifiers hang beneath the word they modify."));
      if (q.q) area.appendChild(h("div", { class: "q-title small" }, q.q));
      const words = q.words || (q.sentence || "").split(/\s+/);
      const place = q.place || {}, placed = {}; let sel = -1;
      const present = new Set(Object.values(place));
      const live = h("div", { class: "sr-only", "aria-live": "polite" });
      const bank = h("div", { class: "dg-bank", "aria-label": "Words to place" });
      const slots = {};
      function announce(m) { live.textContent = ""; setTimeout(() => { live.textContent = m; }, 30); }
      function firstEmptySlot() { return Object.values(slots).find(z => !z.querySelector(".dg-tile")) || Object.values(slots)[0]; }
      function placeSel(zone) { if (L.graded || sel < 0) return; const w = words[sel]; placed[sel] = zone; sel = -1; render(); announce(w + " placed in " + ZL[zone]); const next = words.every((_, i) => placed[i] != null) ? $("checkBtn") : bank.querySelector(".dg-tile"); if (next) setTimeout(() => next.focus(), 0); }
      function zone(z) { // a focusable, keyboard-operable drop target
        const el = h("div", { class: z === "subjMod" || z === "verbMod" || z === "objMod" ? "dg-rail" : "dg-slot", role: "button", tabindex: "0", "data-zone": z, "data-label": ZL[z], "aria-label": ZL[z] + ", drop zone" });
        el.addEventListener("click", () => placeSel(z));
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); placeSel(z); } });
        slots[z] = el; return el;
      }
      function stack(slotZone, modZone) { const kids = [zone(slotZone)]; if (modZone && present.has(modZone)) kids.push(zone(modZone)); return h("div", { class: "dg-stack" }, kids); }
      const row = h("div", { class: "dg-row" }, stack("subject", "subjMod"), h("div", { class: "dg-div" }), stack("verb", "verbMod"));
      if (present.has("object")) { row.appendChild(h("div", { class: "dg-div2" })); row.appendChild(stack("object", "objMod")); }
      if (present.has("complement")) { row.appendChild(h("div", { class: "dg-bslash" })); row.appendChild(stack("complement", null)); } // render both if a sentence has object AND complement
      area.appendChild(h("div", { class: "diagram", role: "group", "aria-label": "Sentence diagram" }, row));
      area.appendChild(bank);
      area.appendChild(live);
      function render() {
        bank.querySelectorAll(".dg-tile").forEach(t => t.remove());
        Object.values(slots).forEach(z => z.querySelectorAll(".dg-tile").forEach(t => t.remove()));
        words.forEach((w, i) => {
          const inZone = placed[i] != null;
          const t = h("button", { class: "dg-tile" + (sel === i ? " sel" : ""), type: "button", "data-i": i, "aria-pressed": sel === i ? "true" : "false",
            "aria-label": inZone ? (w + ", placed in " + ZL[placed[i]] + ", activate to remove") : (sel === i ? (w + ", selected") : w),
            onclick: e => {
              e.stopPropagation(); if (L.graded) return;
              // If another word is already selected, clicking a placed tile drops the selected word
              // into THAT tile's zone, so several words can stack on one rail (e.g. "The" and "wise"
              // both modifying "king") without the click being swallowed by the tile already there.
              if (sel >= 0 && sel !== i && inZone) { placeSel(placed[i]); return; }
              if (inZone) { delete placed[i]; sel = -1; render(); announce(w + " returned to the word bank"); return; }
              sel = (sel === i ? -1 : i); render();
              if (sel === i) { announce(w + " selected. Choose a zone."); const fs = firstEmptySlot(); if (fs) setTimeout(() => fs.focus(), 0); }
            } }, w);
          (inZone && slots[placed[i]] ? slots[placed[i]] : bank).appendChild(t);
        });
        setCheck(words.every((_, i) => placed[i] != null));
      }
      L.st = { get: () => placed, words, place };
      render();
    },
  };
  function mkInput(area, ph, big) {
    const inp = h("input", { class: "text-input", type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: ph });
    inp.addEventListener("input", () => setCheck(inp.value.trim().length > 0));
    // NOTE: Enter is handled ONLY by the global keydown handler in app.js (single authority),
    // so one Enter = Check (pause on feedback) OR Continue, never both.
    area.appendChild(inp);
    L.st = { get: () => inp.value };
    setTimeout(() => inp.focus(), 30);
  }
  function selectMC(idx, btn, wrap) { if (L.graded) return; mcSel = idx; wrap.querySelectorAll(".choice").forEach(b => b.classList.remove("sel")); btn.classList.add("sel"); setCheck(true); }

  // ---------- grade ----------
  function onCheck() {
    const q = L.current;
    if (q.type === "compose" && !(L.st && L.st.reveal)) return revealCompose(q);
    if (L.graded) return;
    let correct = false;
    if (q.type === "mc") correct = mcSel === q.answer;
    else if (q.type === "type" || q.type === "cloze" || q.type === "transform") correct = W.content.gradeAccept(q.accept, L.st.get());
    else if (q.type === "order") { const norm = a => a.map(t => t.toLowerCase().replace(/[.,;:!?'"]/g, "").trim()).join(" "); correct = norm(L.st.get()) === norm(q.answer); } // exact token order (don't strip articles)
    else if (q.type === "parse") { const p = L.st; correct = p.selectable.every(i => p.get()[i] === p.labels[i].tag); }
    else if (q.type === "diagram") { const p = L.st.get(); correct = L.st.words.every((_, i) => p[i] === L.st.place[i]); }
    finishGrade(q, correct);
  }
  function revealCompose(q) {
    L.st.reveal = true;
    const area = qArea();
    const mine = (L.st && L.st.get && L.st.get()) || "";
    const box = h("div", { class: "reveal-box" });
    // side-by-side: your answer vs. the model
    box.appendChild(h("div", { class: "compare" },
      h("div", { class: "cmp-col" }, h("div", { class: "reveal-h" }, "Your answer"), h("div", { class: "ans mine" }, mine.trim() || "(no answer)")),
      h("div", { class: "cmp-col" }, h("div", { class: "reveal-h" }, "Model answer"), h("div", { class: "ans" }, q.model))));
    // rubric as a self-check the learner ticks
    const items = (q.rubric && q.rubric.length) ? q.rubric : [];
    const ticked = items.map(() => false);
    const gradeBtn = h("button", { class: "btn-primary", onclick: () => finishGrade(q, items.length ? ticked.every(Boolean) : true) }, items.length ? "Continue (0/" + items.length + ")" : "Continue ▸");
    function refresh() { const n = ticked.filter(Boolean).length; gradeBtn.textContent = (n === items.length ? "✓ Continue (" : "Continue (") + n + "/" + items.length + ")"; }
    if (items.length) {
      box.appendChild(h("div", { class: "rubric-check" }, h("div", { class: "reveal-h" }, "Check your work against the rubric:"),
        items.map((r, i) => { const cb = h("input", { type: "checkbox" }); cb.addEventListener("change", () => { ticked[i] = cb.checked; refresh(); }); return h("label", { class: "rb-item" }, cb, h("span", null, r)); })));
    }
    area.appendChild(box);
    area.appendChild(h("div", { class: "selfgrade" }, gradeBtn));
    $("checkBtn").style.display = "none";
  }
  function finishGrade(q, correct) {
    if (L.graded) return; L.graded = true; L.answered++;
    if (correct) { L.correct++; L.combo++; L.maxCombo = Math.max(L.maxCombo, L.combo); if (L.combo >= 5 && L.combo % 5 === 0) W.app.toast("🔥 " + L.combo + " in a row!"); }
    else { L.combo = 0; L.wrongQs.push(q); if (L.hearts !== Infinity) { L.hearts = Math.max(0, L.hearts - 1); renderHearts(); } }
    renderCombo();
    if (q.srsId) W.srs.review(q.srsId, correct);
    W.store.recordAnswer(correct, L.lessonId);
    if (q.type === "mc") { qArea().querySelectorAll(".choice").forEach((b, i) => { b.disabled = true; if (i === q.answer) b.classList.add("correct"); else if (i === mcSel && !correct) b.classList.add("wrong"); }); }
    else if (q.type === "parse") {
      const p = L.st; if (p.cleanup) p.cleanup();
      qArea().querySelectorAll(".pw-tag").forEach(b => { b.disabled = true; });
      p.selectable.forEach(i => {
        const cell = qArea().querySelector('.parse-word[data-i="' + i + '"]'); if (!cell) return;
        const ok = p.get()[i] === p.labels[i].tag; cell.classList.add(ok ? "ok" : "bad");
        const btn = cell.querySelector(".pw-tag"); if (!ok && btn) btn.textContent = p.labels[i].tag;
      });
    }
    else if (q.type === "diagram") {
      const p = L.st.get();
      qArea().querySelectorAll(".dg-tile").forEach(t => { t.disabled = true; const i = +t.dataset.i; t.classList.add(p[i] === L.st.place[i] ? "ok" : "bad"); });
    }
    else if (q.type === "order") {
      const nm = t => t.toLowerCase().replace(/[.,;:!?'"]/g, "").trim();
      const ans = (q.answer || []).map(nm), got = (L.st.get() || []);
      qArea().querySelectorAll(".wb-bank .tile").forEach(t => t.disabled = true);
      qArea().querySelectorAll(".wb-answer .tile").forEach((t, i) => { t.disabled = true; t.classList.add(nm(got[i] || "") === ans[i] ? "ok" : "bad"); });
    }
    showFeedback(correct, q);
  }
  function showFeedback(correct, q) {
    const bar = $("feedbackBar"); bar.className = "feedback-bar show " + (correct ? "good" : "bad");
    $("fbIcon").textContent = correct ? "✓" : "✗";
    const txt = $("fbText"); txt.innerHTML = "";
    txt.appendChild(document.createTextNode(correct ? pick(PRAISE) : (q.type === "compose" ? "Keep practicing" : "Not quite")));
    let why = q.why || (q.answerDisplay ? "Answer: " + q.answerDisplay : "");
    if (why) txt.appendChild(h("span", { class: "detail" }, why));
    $("checkBtn").style.display = "none";
    $("fbContinue").textContent = L.i + 1 >= L.queue.length ? "Finish" : "Continue";
  }
  function hideFeedback() { const bar = $("feedbackBar"); if (bar) bar.className = "feedback-bar"; const b = $("checkBtn"); if (b) b.style.display = ""; }
  const PRAISE = ["Correct!", "Right!", "Well done", "Exactly", "Nailed it", "Good"];
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function onContinue() {
    L.i++;
    if (L.hearts === 0) return finish(true);
    if (!L.requeued && L.i >= L.queue.length && L.wrongQs.length) { L.requeued = true; L.queue = L.queue.concat(W.content.shuffle(L.wrongQs)); L.wrongQs = []; }
    next();
  }

  function finish(outOfHearts) {
    teardown();
    const dur = Math.round((Date.now() - L.start) / 1000);
    const acc = L.answered ? Math.round((L.correct / L.answered) * 100) : 0;
    const xp = (outOfHearts ? 0.6 : 1) * (L.correct * 8 + (L.maxCombo >= 5 ? 10 : 0) + (acc === 100 && !outOfHearts ? 15 : 0)) | 0;
    W.store.markPerfect(acc === 100 && !outOfHearts && L.answered >= 6);
    W.store.bumpLessons();
    const lrec = W.store.lesson(L.lessonId), prevBest = lrec.best || 0;
    if (!outOfHearts) { lrec.done = true; lrec.best = Math.max(prevBest, acc); }
    W.store.addXp(xp);
    if (W.app.onLessonComplete) W.app.onLessonComplete(L.courseId, L.lessonId, { acc, outOfHearts });
    W.store.markPerfect(false); W.store.markUnitDone(false);
    showSummary({ xp, acc, dur, outOfHearts, prevBest, newBest: !outOfHearts && acc > prevBest });
    W.app.refreshTopbar();
  }
  function showSummary(s) {
    W.app.show("summary");
    const card = $("summaryCard"); card.innerHTML = "";
    card.appendChild(h("h1", null, s.outOfHearts ? "Out of hearts" : "Lesson complete"));
    if (s.outOfHearts) card.appendChild(h("p", { class: "q-sub" }, "You ran out of hearts in Challenge mode. Turn hearts off in Settings to practice without stakes, or try again."));
    card.appendChild(h("div", { class: "summary-stats" }, stat("+" + s.xp, "XP"), stat(s.acc + "%", "Accuracy"), stat("×" + L.maxCombo, "Best combo"), stat(s.dur + "s", "Time")));
    if (!s.outOfHearts) {
      const tier = s.acc >= 100 ? "Mastered ★" : s.acc >= 80 ? "Proficient" : "Passed";
      card.appendChild(h("div", { class: "summary-mastery" + (s.newBest ? " newbest" : "") }, s.newBest ? "★ New best — " + s.acc + "% · " + tier : "Best " + Math.max(s.prevBest || 0, s.acc) + "% · " + tier));
    }
    card.appendChild(h("div", { class: "summary-actions" },
      h("button", { class: "btn-secondary", onclick: () => W.app.openLesson(L.courseId, L.lessonId) }, "Back to lesson"),
      h("button", { class: "btn-primary", onclick: () => W.app.nextLesson(L.courseId, L.lessonId) }, "Next lesson ▸")));
    if (W.srs.dueCount() > 0) card.appendChild(h("p", { class: "q-sub", style: "margin-top:14px" }, W.srs.dueCount() + " items due for review."));
    const sh = card.querySelector("h1"); if (sh) { sh.setAttribute("tabindex", "-1"); setTimeout(() => { try { sh.focus({ preventScroll: true }); } catch (e) {} }, 0); }
  }
  function stat(v, l) { return h("div", { class: "sstat" }, h("div", { class: "v" }, v), h("div", { class: "l" }, l)); }

  function wire() {
    $("checkBtn").addEventListener("click", onCheck);
    $("fbContinue").addEventListener("click", onContinue);
    $("quitLesson").addEventListener("click", () => { if (confirm("Quit this lesson? Progress in it will be lost.")) { teardown(); W.app.openLesson(L.courseId, L.lessonId); } });
  }
  W.lesson = { start, wire };
})();
