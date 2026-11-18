/* Memory Verses: list + memory games. Data comes from data/verses.json (newest first). */
const STORE_KEY = "memory-verses-progress-v1";
const THEME_KEY = "shelf-theme";
const $ = (id) => document.getElementById(id);
const live = (msg) => { const n = $("live"); n.textContent = ""; requestAnimationFrame(() => { n.textContent = msg; }); };

let verses = [];
let progress = loadProgress();

/* ---------- storage ---------- */
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { verses: {}, match: { right: 0, total: 0 } }; }
  catch (e) { return { verses: {}, match: { right: 0, total: 0 } }; }
}
function saveProgress() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) {}
  renderProgressLine();
}
function vp(id) {
  progress.verses[id] ??= { status: "", practiced: 0, best: {} };
  return progress.verses[id];
}
function touch(id) { const p = vp(id); p.practiced += 1; p.last = new Date().toISOString().slice(0, 10); saveProgress(); }
function setStatus(id, status) { vp(id).status = status; touch(id); }
function setBest(id, game, score) {
  const p = vp(id);
  if (!(p.best[game] >= score)) p.best[game] = score;
  touch(id);
}

/* ---------- text helpers ---------- */
const norm = (s) => s.toLowerCase().replace(/[’‘`]/g, "'").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
/* Split into tokens: { pre, word, post } so punctuation stays put while the word is hidden. */
function tokenize(text) {
  return text.trim().split(/\s+/).map((raw) => {
    const m = raw.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
    return { pre: m[1], word: m[2], post: m[3], raw };
  }).filter((t) => t.word || t.raw);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}
function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ---------- scope ---------- */
function scoped() {
  const v = $("scope").value;
  if (v === "all") return verses;
  if (v === "newest") return verses.slice(0, 1);
  if (v === "learning") {
    const l = verses.filter((x) => vp(x.id).status !== "known");
    return l.length ? l : verses;
  }
  const one = verses.find((x) => x.id === v);
  return one ? [one] : verses;
}
function fillScope() {
  const sel = $("scope");
  for (const v of verses) sel.append(el("option", { value: v.id, text: v.reference }));
  const saved = sessionStorage.getItem("mv-scope");
  if (saved && [...sel.options].some((o) => o.value === saved)) sel.value = saved;
  sel.addEventListener("change", () => {
    sessionStorage.setItem("mv-scope", sel.value);
    games.forEach((g) => g.reset());
    renderActive();
    live(`Practicing ${sel.selectedOptions[0].text}.`);
  });
}
function renderProgressLine() {
  if (!verses.length) return;
  const known = verses.filter((v) => vp(v.id).status === "known").length;
  $("progress-line").textContent = `${verses.length} verse${verses.length === 1 ? "" : "s"} · ${known} marked “got it”`;
}

/* Each game keeps an index into the current scope. */
function cursor() {
  let i = 0;
  return {
    get list() { return scoped(); },
    get verse() { const l = scoped(); if (i >= l.length) i = 0; return l[i]; },
    get index() { return i; },
    move(d) { const n = scoped().length; i = (i + d + n) % n; },
    reset() { i = 0; },
  };
}

/* ---------- verses list ---------- */
function renderList() {
  const q = $("search").value.trim();
  const nq = norm(q);
  const list = verses.filter((v) => !nq || norm(v.reference).includes(nq) || norm(v.text).includes(nq)
    || v.text.toLowerCase().includes(q.toLowerCase()));
  const ol = $("verse-list");
  ol.replaceChildren();
  $("list-count").textContent = q ? `${list.length} of ${verses.length} verses match “${q}”.` : `${verses.length} verses, newest first.`;
  list.forEach((v) => {
    const p = vp(v.id);
    const badge = p.status === "known" ? el("span", { class: "badge known", text: "✓ Got it" })
      : p.status === "learning" ? el("span", { class: "badge learning", text: "Still learning" })
      : v === verses[0] ? el("span", { class: "badge new-v", text: "Newest" }) : null;
    const textP = el("p", { class: "verse-text" });
    highlight(textP, v.text, q);
    ol.append(el("li", { class: "verse-card" },
      el("h2", { text: v.reference }),
      textP,
      el("div", { class: "meta" },
        el("span", { text: `Added ${fmtDate(v.added)}` }),
        el("span", { text: v.translation }),
        badge,
        v.source ? el("a", { href: v.source, rel: "noopener", target: "_blank", text: "Read in context", "aria-label": `Read ${v.reference} in context (opens in a new tab)` }) : null),
      el("div", { class: "row" },
        el("button", { type: "button", class: "btn", text: "Flash card", "aria-label": `Practice ${v.reference} with a flash card`, onclick: () => practice(v.id, "flash") }),
        el("button", { type: "button", class: "btn", text: "Fill in", "aria-label": `Practice ${v.reference} with fill in the blank`, onclick: () => practice(v.id, "blank") }))));
  });
  if (!list.length) ol.append(el("li", { class: "empty", text: "No verses match that search." }));
}
function highlight(node, text, q) {
  if (!q) { node.textContent = text; return; }
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) { node.textContent = text; return; }
  node.append(text.slice(0, i), el("mark", { text: text.slice(i, i + q.length) }), text.slice(i + q.length));
}
function practice(id, mode) {
  $("scope").value = id;
  $("scope").dispatchEvent(new Event("change"));
  selectTab(mode, true);
}

/* ---------- flash cards ---------- */
const flash = (() => {
  const c = cursor();
  let order = null; // shuffled order of ids, or null for list order
  let flipped = false;
  const list = () => {
    const l = c.list;
    if (!order) return l;
    const byId = new Map(l.map((v) => [v.id, v]));
    return order.map((id) => byId.get(id)).filter(Boolean);
  };
  let i = 0;
  function render() {
    const l = list();
    if (i >= l.length) i = 0;
    const v = l[i];
    const rev = $("flash-reverse").checked;
    $("flash-front").textContent = rev ? v.text : v.reference;
    $("flash-back").textContent = rev ? v.reference : v.text;
    document.querySelector(".front .face-label").textContent = rev ? "Verse" : "Reference";
    document.querySelector(".back .face-label").textContent = rev ? "Reference" : "Verse";
    $("flash-front").className = "face-text" + (rev ? " verse-text" : "");
    $("flash-back").className = "face-text" + (rev ? "" : " verse-text");
    const card = $("flash-card");
    card.classList.toggle("flipped", flipped);
    card.setAttribute("aria-label", flipped
      ? `${rev ? "Reference" : "Verse"}: ${rev ? v.reference : v.text}. Press to flip back.`
      : `${rev ? "Verse" : "Reference"}: ${rev ? v.text : v.reference}. Press to flip.`);
    const st = vp(v.id).status;
    $("flash-pos").textContent = `Card ${i + 1} of ${l.length}${st === "known" ? " · ✓ got it" : st === "learning" ? " · still learning" : ""}`;
    $("flash-prev").disabled = $("flash-next").disabled = $("flash-shuffle").disabled = l.length < 2;
  }
  function flip() { flipped = !flipped; render(); }
  function move(d) { const n = list().length; i = (i + d + n) % n; flipped = false; render(); }
  function mark(status) {
    const v = list()[i];
    setStatus(v.id, status);
    live(status === "known" ? `${v.reference} marked got it.` : `${v.reference} marked still learning.`);
    if (list().length > 1) move(1); else render();
  }
  $("flash-card").addEventListener("click", flip);
  $("flash-prev").addEventListener("click", () => move(-1));
  $("flash-next").addEventListener("click", () => move(1));
  $("flash-shuffle").addEventListener("click", () => { order = shuffle(c.list.map((v) => v.id)); i = 0; flipped = false; render(); live("Cards shuffled."); });
  $("flash-got").addEventListener("click", () => mark("known"));
  $("flash-learning").addEventListener("click", () => mark("learning"));
  $("flash-reverse").addEventListener("change", () => { flipped = false; render(); });
  return {
    mode: "flash", render, reset() { order = null; i = 0; flipped = false; },
    key(e) {
      if (e.key === " " && e.target === document.body) { e.preventDefault(); flip(); }
      else if (e.key === "ArrowRight" && !isTyping(e)) move(1);
      else if (e.key === "ArrowLeft" && !isTyping(e)) move(-1);
    },
  };
})();
function isTyping(e) { return /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.getAttribute("role") === "tab"; }

/* ---------- fill in the blank ---------- */
const blank = (() => {
  const c = cursor();
  let tokens = [], hiddenIdx = new Set();
  const level = () => Number(document.querySelector('input[name="blank-level"]:checked').value);
  function pick() {
    const v = c.verse;
    tokens = tokenize(v.text);
    const wordIdx = tokens.map((t, i) => (t.word ? i : -1)).filter((i) => i >= 0);
    const n = Math.max(1, Math.round(wordIdx.length * level()));
    hiddenIdx = new Set(shuffle(wordIdx).slice(0, n));
  }
  function render() {
    if (!tokens.length) pick();
    const v = c.verse;
    $("blank-ref").textContent = v.reference;
    const form = $("blank-form");
    form.replaceChildren();
    let n = 0;
    tokens.forEach((t, i) => {
      if (i) form.append(" ");
      if (!hiddenIdx.has(i)) { form.append(t.raw); return; }
      n += 1;
      const input = el("input", {
        type: "text", size: Math.max(3, t.word.length), "aria-label": `Blank ${n} of ${hiddenIdx.size}`,
        autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "next", "data-i": i,
      });
      input.style.width = `${Math.max(3, t.word.length) + 1.5}ch`;
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const all = [...form.querySelectorAll("input")];
        const next = all[all.indexOf(input) + 1];
        if (next) next.focus(); else check();
      });
      input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); input.classList.remove("ok"); });
      form.append(t.pre, input, el("span", { class: "mark", "aria-hidden": "true" }), t.post);
    });
    $("blank-result").textContent = "";
    $("blank-prev").disabled = $("blank-next").disabled = c.list.length < 2;
  }
  function check() {
    const inputs = [...$("blank-form").querySelectorAll("input")];
    let right = 0;
    inputs.forEach((inp) => {
      const t = tokens[Number(inp.dataset.i)];
      const ok = norm(inp.value) === norm(t.word);
      const mark = inp.nextElementSibling;
      if (ok) { right += 1; inp.classList.add("ok"); inp.removeAttribute("aria-invalid"); mark.className = "mark mark-ok"; mark.textContent = "✓"; }
      else { inp.classList.remove("ok"); inp.setAttribute("aria-invalid", "true"); mark.className = "mark mark-bad"; mark.textContent = "✗"; }
    });
    const pct = Math.round((right / inputs.length) * 100);
    $("blank-result").textContent = right === inputs.length ? `All ${right} right. Well done!` : `${right} of ${inputs.length} right. Fix the ones marked ✗, or show answers.`;
    $("blank-result").className = "result " + (right === inputs.length ? "ok-text" : "bad-text");
    setBest(c.verse.id, `blank${Math.round(level() * 100)}`, pct);
    const firstBad = inputs.find((x) => x.getAttribute("aria-invalid"));
    if (firstBad && right) firstBad.focus();
  }
  function reveal() {
    [...$("blank-form").querySelectorAll("input")].forEach((inp) => {
      const t = tokens[Number(inp.dataset.i)];
      if (norm(inp.value) !== norm(t.word)) { inp.value = t.word; inp.removeAttribute("aria-invalid"); inp.nextElementSibling.textContent = ""; }
    });
    $("blank-result").textContent = "Answers shown. Try New blanks to practice again.";
    $("blank-result").className = "result";
  }
  $("blank-check").addEventListener("click", check);
  $("blank-reveal").addEventListener("click", reveal);
  $("blank-new").addEventListener("click", () => { pick(); render(); $("blank-form").querySelector("input")?.focus(); });
  $("blank-prev").addEventListener("click", () => { c.move(-1); pick(); render(); });
  $("blank-next").addEventListener("click", () => { c.move(1); pick(); render(); });
  $("blank-form").addEventListener("submit", (e) => { e.preventDefault(); check(); });
  document.querySelectorAll('input[name="blank-level"]').forEach((r) => r.addEventListener("change", () => { pick(); render(); }));
  return { mode: "blank", render, reset() { c.reset(); tokens = []; } };
})();

/* ---------- first letters ---------- */
const letters = (() => {
  const c = cursor();
  let showAll = false;
  function render() {
    const v = c.verse;
    $("letters-ref").textContent = v.reference;
    const p = $("letters-text");
    p.replaceChildren();
    tokenize(v.text).forEach((t, i) => {
      if (i) p.append(" ");
      if (!t.word) { p.append(t.raw); return; }
      const first = t.word[0];
      const b = el("button", { type: "button", class: "word-btn", "aria-label": `Word starting with ${first}. Tap to peek.` });
      const set = (full) => {
        b.textContent = full ? t.word : first;
        b.classList.toggle("peek", full && !showAll);
        b.setAttribute("aria-label", full ? t.word : `Word starting with ${first}. Tap to peek.`);
      };
      set(showAll);
      b.addEventListener("click", () => set(!b.classList.contains("peek") || showAll ? true : false));
      p.append(t.pre, b, t.post);
    });
    $("letters-toggle").setAttribute("aria-pressed", String(showAll));
    $("letters-toggle").textContent = showAll ? "Show first letters" : "Show whole verse";
    $("letters-prev").disabled = $("letters-next").disabled = c.list.length < 2;
  }
  $("letters-toggle").addEventListener("click", () => { showAll = !showAll; render(); });
  $("letters-reset").addEventListener("click", () => { showAll = false; render(); });
  $("letters-prev").addEventListener("click", () => { c.move(-1); showAll = false; render(); touch(c.verse.id); });
  $("letters-next").addEventListener("click", () => { c.move(1); showAll = false; render(); touch(c.verse.id); });
  return { mode: "letters", render, reset() { c.reset(); showAll = false; } };
})();

/* ---------- word order ---------- */
const order = (() => {
  const c = cursor();
  let tokens = [], placed = 0, chips = [], mistakes = 0;
  function start() {
    tokens = tokenize(c.verse.text);
    placed = 0; mistakes = 0;
    chips = shuffle(tokens.map((t, i) => ({ i, label: t.raw })));
  }
  function render() {
    if (!tokens.length) start();
    $("order-ref").textContent = c.verse.reference;
    const built = $("order-built");
    built.textContent = tokens.slice(0, placed).map((t) => t.raw).join(" ") || "…";
    const box = $("order-chips");
    box.replaceChildren();
    chips.forEach((ch) => {
      if (ch.i < placed) return;
      box.append(el("button", { type: "button", class: "chip", text: ch.label, "data-i": ch.i, onclick: (e) => tap(ch, e.currentTarget) }));
    });
    $("order-prev").disabled = $("order-next").disabled = c.list.length < 2;
  }
  function tap(ch, btn) {
    const expect = tokens[placed];
    if (norm(ch.label) === norm(expect.raw) && ch.label === expect.raw || ch.i === placed) {
      // Duplicate words are interchangeable: swap so the tapped chip counts as the expected one.
      if (ch.i !== placed) { const other = chips.find((x) => x.i === placed); other.i = ch.i; ch.i = placed; }
      placed += 1;
      if (placed === tokens.length) {
        render();
        const score = Math.max(0, 100 - mistakes * 10);
        $("order-result").textContent = mistakes ? `Done! ${mistakes} wrong tap${mistakes === 1 ? "" : "s"}.` : "Done with no mistakes!";
        $("order-result").className = "result ok-text";
        setBest(c.verse.id, "order", score);
        $("order-reset").focus();
        return;
      }
      $("order-result").textContent = "";
      render();
      $("order-chips").querySelector(".chip")?.focus();
    } else {
      mistakes += 1;
      btn.classList.remove("wrong"); void btn.offsetWidth; btn.classList.add("wrong");
      $("order-result").textContent = `Not “${ch.label}” yet. Try another word.`;
      $("order-result").className = "result bad-text";
    }
  }
  $("order-hint").addEventListener("click", () => {
    const btn = $("order-chips").querySelector(`.chip[data-i="${placed}"]`);
    if (!btn) return;
    btn.classList.add("hint"); btn.focus();
    $("order-result").textContent = `Next word: “${tokens[placed].raw}”.`;
    $("order-result").className = "result";
  });
  $("order-reset").addEventListener("click", () => { start(); $("order-result").textContent = ""; render(); });
  $("order-prev").addEventListener("click", () => { c.move(-1); start(); $("order-result").textContent = ""; render(); });
  $("order-next").addEventListener("click", () => { c.move(1); start(); $("order-result").textContent = ""; render(); });
  return { mode: "order", render, reset() { c.reset(); tokens = []; $("order-result").textContent = ""; } };
})();

/* ---------- reference match ---------- */
const match = (() => {
  let current = null, answered = false;
  const kind = () => document.querySelector('input[name="match-kind"]:checked').value;
  function next() {
    const pool = scoped();
    const target = pool[Math.floor(Math.random() * pool.length)];
    const others = shuffle(verses.filter((v) => v.id !== target.id)).slice(0, 3);
    current = { target, options: shuffle([target, ...others]) };
    answered = false;
    render();
  }
  function render() {
    const area = $("match-area");
    area.replaceChildren();
    if (verses.length < 2) { area.append(el("p", { class: "empty", text: "Matching needs at least two verses. Check back after the next verse is added." })); $("match-next").hidden = true; return; }
    $("match-next").hidden = false;
    if (!current) { next(); return; }
    const k = kind();
    const { target, options } = current;
    area.append(el("div", { class: "match-q" },
      el("p", { class: "q-label", text: k === "ref" ? "Which reference is this verse?" : "Which verse is this reference?" }),
      el("p", { class: "q-body " + (k === "ref" ? "verse-text" : "ref"), text: k === "ref" ? target.text : target.reference })));
    const ul = el("ul", { class: "options", role: "list" });
    options.forEach((o) => ul.append(el("li", {}, el("button", {
      type: "button", class: "option" + (k === "verse" ? " verse-opt" : ""), text: k === "ref" ? o.reference : o.text,
      "data-id": o.id, onclick: (e) => choose(o, e.currentTarget),
    }))));
    area.append(ul);
    const m = progress.match;
    $("match-score").textContent = m.total ? `Score: ${m.right} of ${m.total}` : "";
    $("match-result").textContent = "";
  }
  function choose(o, btn) {
    if (answered) return;
    answered = true;
    const ok = o.id === current.target.id;
    progress.match.total += 1;
    if (ok) progress.match.right += 1;
    $("match-area").querySelectorAll(".option").forEach((b) => {
      b.disabled = true;
      if (b.dataset.id === current.target.id) { b.classList.add("correct"); b.prepend("✓ "); }
    });
    if (!ok) { btn.classList.add("incorrect"); btn.prepend("✗ "); }
    touch(current.target.id);
    $("match-result").textContent = ok ? "Correct!" : `Not quite. It’s ${current.target.reference}.`;
    $("match-result").className = "result " + (ok ? "ok-text" : "bad-text");
    $("match-score").textContent = `Score: ${progress.match.right} of ${progress.match.total}`;
    $("match-next").focus();
  }
  $("match-next").addEventListener("click", next);
  document.querySelectorAll('input[name="match-kind"]').forEach((r) => r.addEventListener("change", render));
  return { mode: "match", render, reset() { current = null; } };
})();

/* ---------- fade away (progressive hide) ---------- */
const hide = (() => {
  const c = cursor();
  let tokens = [], orderIdx = [], hiddenCount = 0, step = 1;
  function start() {
    tokens = tokenize(c.verse.text);
    const words = tokens.map((t, i) => (t.word ? i : -1)).filter((i) => i >= 0);
    orderIdx = shuffle(words);
    hiddenCount = 0;
    step = Math.max(1, Math.ceil(words.length / 5));
  }
  function render() {
    if (!tokens.length) start();
    $("hide-ref").textContent = c.verse.reference;
    const hidden = new Set(orderIdx.slice(0, hiddenCount));
    const p = $("hide-text");
    p.replaceChildren();
    tokens.forEach((t, i) => {
      if (i) p.append(" ");
      if (!hidden.has(i)) { p.append(t.raw); return; }
      const blankTxt = "_".repeat(Math.max(2, t.word.length));
      const b = el("button", { type: "button", class: "word-btn hidden-word", text: blankTxt, "aria-label": "Hidden word. Tap to peek." });
      b.addEventListener("click", () => {
        const peeking = b.classList.toggle("peek");
        b.classList.toggle("hidden-word", !peeking);
        b.textContent = peeking ? t.word : blankTxt;
        b.setAttribute("aria-label", peeking ? t.word : "Hidden word. Tap to peek.");
      });
      p.append(t.pre, b, t.post);
    });
    const total = orderIdx.length;
    $("hide-pos").textContent = hiddenCount === 0 ? "Round 1: read the whole verse aloud."
      : hiddenCount >= total ? "Every word is hidden. Say it from memory!" : `${hiddenCount} of ${total} words hidden.`;
    $("hide-more").disabled = hiddenCount >= total;
    $("hide-prev").disabled = $("hide-next").disabled = c.list.length < 2;
  }
  $("hide-more").addEventListener("click", () => {
    hiddenCount = Math.min(orderIdx.length, hiddenCount + step);
    render();
    if (hiddenCount >= orderIdx.length) setBest(c.verse.id, "fade", 100);
  });
  $("hide-reset").addEventListener("click", () => { start(); render(); });
  $("hide-prev").addEventListener("click", () => { c.move(-1); start(); render(); });
  $("hide-next").addEventListener("click", () => { c.move(1); start(); render(); });
  return { mode: "hide", render, reset() { c.reset(); tokens = []; } };
})();

const list = { mode: "list", render: renderList, reset() {} };
const games = [list, flash, blank, letters, order, match, hide];

/* ---------- tabs ---------- */
const tabs = [...document.querySelectorAll('[role="tab"]')];
let active = "list";
function selectTab(mode, focusPanel = false) {
  if (!games.some((g) => g.mode === mode)) mode = "list";
  active = mode;
  for (const t of tabs) {
    const on = t.dataset.mode === mode;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    $(`panel-${t.dataset.mode}`).hidden = !on;
    if (on) t.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  history.replaceState(null, "", mode === "list" ? location.pathname : `#${mode}`);
  renderActive();
  if (focusPanel) $(`tab-${mode}`).focus();
}
function renderActive() { if (verses.length) games.find((g) => g.mode === active).render(); }
tabs.forEach((t, i) => {
  t.addEventListener("click", () => selectTab(t.dataset.mode));
  t.addEventListener("keydown", (e) => {
    let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = tabs.length - 1;
    if (j == null) return;
    e.preventDefault();
    selectTab(tabs[j].dataset.mode);
    tabs[j].focus();
  });
});
document.addEventListener("keydown", (e) => { if (active === "flash") flash.key(e); });

/* ---------- theme ---------- */
const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
function applyTheme(t) {
  document.querySelector('meta[name="color-scheme"]').content = t || "light dark";
  if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
  try { t ? localStorage.setItem(THEME_KEY, t) : localStorage.removeItem(THEME_KEY); } catch (e) {}
  const dark = t ? t === "dark" : systemDark();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = dark ? "#161310" : "#f4efe6"; });
  const b = document.querySelector(".theme-btn");
  b.setAttribute("aria-pressed", String(dark));
  b.setAttribute("aria-label", dark ? "Switch to light colors" : "Switch to dark colors");
}
document.querySelector(".theme-btn").addEventListener("click", () => {
  const stored = document.documentElement.getAttribute("data-theme");
  const dark = stored ? stored === "dark" : systemDark();
  const target = dark ? "light" : "dark";
  applyTheme(target === (systemDark() ? "dark" : "light") ? "" : target);
});
applyTheme(document.documentElement.getAttribute("data-theme") || "");

/* ---------- reset ---------- */
$("reset-progress").addEventListener("click", () => {
  if (!confirm("Clear all saved progress for these verses on this device?")) return;
  progress = { verses: {}, match: { right: 0, total: 0 } };
  saveProgress();
  renderActive();
  live("Progress cleared.");
});

/* ---------- boot ---------- */
$("search").addEventListener("input", renderList);
async function boot() {
  try {
    const res = await fetch("data/verses.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    verses = (await res.json()).filter((v) => v && v.reference && v.text)
      .sort((a, b) => (b.added || "").localeCompare(a.added || ""));
  } catch (e) {
    $("verse-list").replaceChildren(el("li", { class: "empty", text: "The verse list couldn’t load. Check your connection and refresh." }));
    return;
  }
  fillScope();
  renderProgressLine();
  selectTab(location.hash.slice(1) || "list");
}
boot();
