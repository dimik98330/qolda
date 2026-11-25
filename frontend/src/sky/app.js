// Qolda «Небо и керамика»: the screens are the design canvas, the behaviour is the shared client's core
// (store, analyzer, statistics). Nothing here invents a verdict: anything but a well-formed answer is an error.
import { SCREENS } from "./screens.js";
import { R } from "./renders.js";
import { GEOLOGICA } from "./font.js";
import { store } from "../core/store.js";
import { engine, clipHash, MAX_BYTES, TYPES } from "../core/api.js";
import { dayKey, lastDays, byDay, streak, sum, countsOf } from "../domain/stats.js";
import { profile } from "../platform/profile.js";
import { androidBridge } from "../platform/android.js";
import { lang, setLang, tr, localize, watch } from "./lang.js";

// Inside the Android app the analyzer is the phone's own GPU engine behind the native bridge
// (android/ANDROID_BRIDGE.md): the system picker hands over a token, never the file itself.
const PHONE = () => profile.name === "android";

const app = document.getElementById("app");
const SVG = "http://www.w3.org/2000/svg";
const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const EASE = ["очень тяжело", "тяжело", "средне", "легко", "очень легко"];
const LABEL = { complete: "Выполнено", incomplete: "Проверьте инструкцию", uncertain: "Не оценено уверенно" };
const MODEL = { scratch: "A, обучена с нуля", transfer: "B, дообученный энкодер" };
const HEALTH = { ok: "На связи", nomodel: "Без модели", down: "Нет связи" };
const HEALTH_LONG = { ok: "Анализатор подключён", nomodel: "Анализатор без модели", down: "Анализатор недоступен" };
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many; };
const cycles = (n) => n + " " + plural(n, "цикл", "цикла", "циклов");

// ---------- the font ships inside the bundle: the project's server has a fixed list of files ----------
try {
  const bin = atob(GEOLOGICA), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  document.fonts.add(new FontFace("Geologica", bytes.buffer, { weight: "100 900" }));
} catch (_) { /* the system font stack takes over */ }

// ---------- templates ----------
/** Inline styles are forbidden by the CSP, so they travel as data-s and are applied through the CSSOM. */
function hydrate(root) {
  const all = [root, ...root.querySelectorAll("*")];
  for (const el of all) {
    if (el.dataset && el.dataset.s != null) { el.style.cssText = el.dataset.s; delete el.dataset.s; }
    if (el.dataset && el.dataset.r) { const u = R[el.dataset.r]; if (el.tagName === "IMG") el.src = u; else el.style.backgroundImage = "url(" + u + ")"; }
  }
  for (const [cls, key] of [["fig-hero", "fig-hero"], ["fig-side", "fig-side"]])
    for (const el of all) if (el.classList && el.classList.contains(cls)) el.style.backgroundImage = "url(" + R[key] + ")";
  return root;
}
function frag(html) {
  const doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
  const box = document.importNode(doc.body.firstElementChild, true);
  hydrate(box);
  return [...box.childNodes];
}
const one = (html) => frag(html.trim())[0];
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const ARROW = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
const CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';

// ---------- small shared pieces ----------
function ticks(svg, goal, done, { empty = "#fff", emptyOpacity = ".85", last = false } = {}) {
  const n = Math.max(1, goal), w = 388, sw = Math.min(16, Math.max(4, (w / n) * 0.42)), step = n > 1 ? (w - sw) / (n - 1) : 0;
  svg.replaceChildren();
  for (let i = 0; i < n; i++) {
    const x = (sw / 2 + i * step).toFixed(1), filled = i < done;
    const p = svgEl("path", { d: "M" + x + " 8v28", "stroke-width": sw.toFixed(1), "stroke-linecap": "round", stroke: filled ? (last && i === done - 1 ? "#FFBE2E" : "#1F3FE6") : empty });
    if (!filled) p.setAttribute("stroke-opacity", emptyOpacity);
    svg.append(p);
  }
  svg.setAttribute("aria-label", "План на сегодня: проверено " + Math.min(done, 999) + " из " + goal);
}
function bars(box, labelBox, days, map, unit, todayKey) {
  box.replaceChildren(); labelBox.replaceChildren();
  for (const d of days) {
    const k = dayKey(d), c = map.get(k) || { complete: 0, incomplete: 0, uncertain: 0, total: 0 };
    const col = one('<div data-s="flex: 1; display: flex; flex-direction: column; gap: 3px; justify-content: flex-end; height: 100%; min-width: 0"></div>');
    const parts = [["uncertain", c.uncertain], ["incomplete", c.incomplete], ["complete", c.complete]].filter((p) => p[1] > 0);
    if (!parts.length) col.append(one('<span class="f-none" data-s="height: 6px; border-radius: 3px"></span>'));
    parts.forEach(([name, v], i) => {
      const r = parts.length === 1 ? "9px" : i === 0 ? "9px 9px 3px 3px" : i === parts.length - 1 ? "3px 3px 9px 9px" : "3px";
      const seg = one('<span class="f-' + name + '"></span>'); seg.style.height = Math.max(8, v * unit) + "px"; seg.style.borderRadius = r; col.append(seg);
    });
    col.title = WD[d.getDay()] + ": " + c.total;
    box.append(col);
    const lab = one('<span data-s="flex: 1; min-width: 0"></span>');
    lab.textContent = days.length > 10 ? (d.getDate() % 5 === 0 || k === todayKey ? String(d.getDate()) : "") : WD[d.getDay()];
    if (k === todayKey) { lab.style.color = "#0C1633"; lab.style.fontWeight = "600"; }
    labelBox.append(lab);
  }
}
function paintStatus(root) {
  for (const chip of root.querySelectorAll(".q-status")) {
    chip.dataset.state = engine.state;
    chip.replaceChildren(document.createElement("i"), document.createTextNode(HEALTH[engine.state]));
    chip.title = HEALTH_LONG[engine.state];
  }
}
function segmented(box, value, onPick) {
  const btns = [...box.querySelectorAll("button")];
  const paint = (v) => btns.forEach((b) => { const on = b.dataset.v === v; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); });
  btns.forEach((b) => b.addEventListener("click", () => { paint(b.dataset.v); onPick(b.dataset.v); }));
  paint(value);
}
function stepper(box, value, onChange) {
  const out = box.querySelector("output"), [minus, plus] = box.querySelectorAll("button");
  let v = value; out.textContent = v;
  const set = (n) => { v = Math.min(60, Math.max(1, n)); out.textContent = v; onChange(v); };
  minus.addEventListener("click", () => set(v - 1)); plus.addEventListener("click", () => set(v + 1));
}
function toggle(btn, value, onChange) {
  let v = !!value;
  const paint = () => { btn.classList.toggle("is-off", !v); btn.setAttribute("aria-checked", String(v)); };
  btn.addEventListener("click", () => { v = !v; paint(); onChange(v); }); paint();
}
const todayStats = () => { const map = byDay(store.state.data.attempts), key = dayKey(new Date()); return { map, key, today: map.get(key) || { complete: 0, incomplete: 0, uncertain: 0, total: 0 } }; };

// ---------- screens ----------
const view = {};

view.welcome = (root, $) => {
  const p = store.state.data.profile, draft = { arm: p.arm || "right", goal: p.goal || 10, persist: !!store.state.prefs.persist };
  const form = $("setup"), nick = form.querySelector("#nick"), fig = $("armfig");
  nick.maxLength = 40; nick.value = p.nick || "";
  const seg = form.querySelector(".q-seg"); const [l, r] = seg.querySelectorAll("button"); l.dataset.v = "left"; r.dataset.v = "right";
  const paintArm = () => { fig.src = R[draft.arm === "left" ? "fig-front-l" : "fig-front-r"]; };
  segmented(seg, draft.arm, (v) => { draft.arm = v; paintArm(); }); paintArm();
  stepper(form.querySelector(".q-stepper"), draft.goal, (v) => { draft.goal = v; });
  toggle(form.querySelector(".q-toggle"), draft.persist, (v) => { draft.persist = v; });
  const start = (e) => {
    e.preventDefault();
    store.setPrefs({ persist: draft.persist, onboarded: true });
    store.setProfile({ nick: nick.value, arm: draft.arm, goal: draft.goal });
    go("");
  };
  $("start").addEventListener("click", start); form.addEventListener("submit", start);
};

view.today = (root, $) => {
  const { nick, goal } = store.state.data.profile, { map, key, today } = todayStats(), h = new Date().getHours();
  $("hello").textContent = (h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер") + (nick ? ", " + nick : "");
  $("count").textContent = today.total; $("of").textContent = "из " + goal;
  ticks($("ticks"), goal, today.total);
  $("cta").textContent = today.total ? "Проверить ещё цикл" : "Проверить первый цикл";
  $("left").textContent = today.total >= goal ? "Цель дня достигнута" : "До цели дня осталось: " + (goal - today.total);
  const days = lastDays(7), week = sum(map, days.map(dayKey)), max = Math.max(1, ...days.map((d) => (map.get(dayKey(d)) || { total: 0 }).total));
  bars($("bars"), $("days"), days, map, Math.min(15, 120 / max), key);
  $("weeksum").textContent = week.total ? cycles(week.total) + ", из них выполнено: " + week.complete + "." : "Пока нет проверенных циклов.";
  const easeBox = $("ease"), note = $("easenote"), saved = store.state.data.checkins.find((c) => c.day === key);
  const paintEase = (v) => {
    [...easeBox.children].forEach((b, i) => { b.classList.toggle("is-on", i + 1 === v); b.setAttribute("aria-pressed", String(i + 1 === v)); });
    note.textContent = v ? "Отмечено: " + EASE[v - 1] : "Отметьте, как давались движения";
  };
  [...easeBox.children].forEach((b, i) => b.addEventListener("click", () => { store.setCheckin(key, { ease: i + 1 }); paintEase(i + 1); }));
  paintEase(saved && saved.ease);
  const st = streak(map);
  $("streak").textContent = st.current; $("streakword").textContent = plural(st.current, "день", "дня", "дней") + " подряд";
  $("best").textContent = "лучшая серия: " + st.best;
};

// One check: instruction -> video -> consent and sending -> result. Kept across re-renders of the card.
const flow = { step: 1, blob: null, native: null, live: false, type: "", consent: false, busy: false, error: "", ctrl: null, stream: null, rec: null, timer: 0 };
let last = null;
/** A native selection belongs to one mounted check: give its grant back as soon as it is not needed. */
function releaseNative() {
  const v = flow.native; flow.native = null;
  if (v) { try { androidBridge.release(v.token).catch(() => {}); } catch (_) { /* the Activity already dropped it */ } }
}
function stopCamera() {
  clearInterval(flow.timer); flow.timer = 0;
  if (flow.rec && flow.rec.state !== "inactive") { flow.rec.onstop = null; try { flow.rec.stop(); } catch (_) {} }
  if (flow.stream) flow.stream.getTracks().forEach((t) => t.stop());
  flow.rec = null; flow.stream = null;
}
view.check = (root, $) => {
  const card = $("card"), stepsBox = $("steps"), names = ["Инструкция", "Видео", "Отправка", "Результат"];
  function paintSteps() {
    $("stepnav").textContent = "Шаг " + flow.step + " из 4";
    stepsBox.replaceChildren();
    names.forEach((name, i) => {
      const n = i + 1, done = n < flow.step, cur = n === flow.step;
      if (i) stepsBox.append(one('<li aria-hidden="true" data-s="width: 28px; height: 2px; background: ' + (done || cur ? "#1F3FE6" : "rgba(12,22,51,.22)") + '"></li>'));
      const li = one('<li data-s="display: flex; align-items: center; gap: 10px; color: ' + (cur ? "#0C1633" : done ? "#3A4668" : "#5A6689") + (cur ? "; font-weight: 600" : "") + '"><span class="q-num' + (cur ? " q-num--on" : done ? "" : " q-num--next") + '" data-s="width: 40px; height: 40px' + (done ? "; background: #1F3FE6" : "") + '">' + (done ? CHECK : n) + "</span></li>");
      if (cur) li.setAttribute("aria-current", "step");
      li.append(document.createTextNode(name)); stepsBox.append(li);
    });
  }
  function fail(text, stop) { flow.error = text; flow.errorStop = !!stop; render(); }
  function dropClip() { if (flow.url) URL.revokeObjectURL(flow.url); flow.url = null; }
  // The chosen video fills the stage card; while it is analysed a scan line runs over it.
  const stage = root.querySelector("figure.q-card--stage"), stageOrig = [...stage.childNodes];
  function paintStage() {
    if (!flow.blob || flow.recording) { if (stage.dataset.clip) { stage.replaceChildren(...stageOrig); delete stage.dataset.clip; } return; }
    if (!flow.url) flow.url = URL.createObjectURL(flow.blob);
    if (stage.dataset.clip !== flow.url) {
      stage.dataset.clip = flow.url;
      stage.replaceChildren(...frag('<video class="q-clip" muted playsinline loop autoplay aria-label="Выбранное видео упражнения"></video><span class="q-clip-tag">Ваше видео</span><div class="q-scan" hidden><span class="q-scan-line"></span><p class="q-scan-note" role="status">Анализ на видеокарте…</p></div>'));
      const v = stage.querySelector("video"); v.src = flow.url; v.play().catch(() => {});
    }
    stage.querySelector(".q-scan").hidden = !flow.busy;
  }
  function take(file) {
    if (!file) return;
    const type = (file.type || "").split(";")[0];
    if (!TYPES.includes(type)) return fail("Поддерживаются только MP4 и WebM.");
    if (!file.size) return fail("Файл пустой.");
    if (file.size > MAX_BYTES) return fail("Файл больше 64 МБ.");
    dropClip(); flow.blob = file; flow.type = type; flow.error = ""; flow.step = 3; render();
  }
  async function record() {
    flow.error = "";
    if (!navigator.mediaDevices || !window.MediaRecorder) return fail("Камера недоступна. Можно выбрать готовый файл: разрешение камеры для этого не нужно.");
    try { flow.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
    catch (_) { return fail("Камера недоступна. Можно выбрать готовый файл: разрешение камеры для этого не нужно."); }
    const mime = ["video/webm;codecs=vp9", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { stopCamera(); return fail("Этот браузер не умеет записывать MP4 или WebM. Выберите готовый файл."); }
    let left = 3; flow.recording = "count"; flow.count = left; render();
    flow.timer = setInterval(() => {
      left -= 1;
      if (left > 0) { flow.count = left; render(); return; }
      clearInterval(flow.timer);
      const chunks = []; flow.rec = new MediaRecorder(flow.stream, { mimeType: mime });
      flow.rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      flow.rec.onstop = () => { const blob = new Blob(chunks, { type: mime.split(";")[0] }); stopCamera(); flow.recording = ""; take(blob); };
      flow.rec.start(); flow.recording = "on"; flow.seconds = 0; render();
      flow.timer = setInterval(() => { flow.seconds += 1; const t = card.querySelector("[data-el=rectime]"); if (t) t.textContent = "Идёт запись · " + flow.seconds + " с из 30"; if (flow.seconds >= 30 && flow.rec) flow.rec.stop(); }, 1000);
    }, 1000);
  }
  // A final, well-formed answer (file or live) goes into the history once, keyed by the clip's hash.
  function finish(data, hash) {
    const list = data.attempts || [];
    if (!list.length) { releaseNative(); return fail("Рука не видна достаточно хорошо для оценки. Попытка не засчитана."); }
    const dup = store.addAttempts(data, hash), a = list[0];
    last = { label: a.label, confidence: typeof a.confidence === "number" ? a.confidence : null, reason: a.reason || null, model: data.model || store.state.prefs.model, dup, url: flow.url, type: flow.type };
    flow.url = null; flow.step = 1; flow.blob = null; releaseNative(); flow.consent = false; engine.check(); go("result");
  }
  function explain(res) {
    if (res.kind === "canceled") return fail("Отправка отменена.");
    if (res.kind === "offline") return fail("Нет связи с локальным анализатором. Проверьте, что движок запущен, и восстановите подключение.", true);
    const code = res.code || "";
    if (code === "no_pose") return fail("Рука не видна достаточно хорошо для оценки. Попытка не засчитана.");
    if (code.includes("camera")) return fail("Камера недоступна. Можно выбрать готовое видео из галереи.");
    if (res.status === 503 || code === "model_unavailable") return fail(PHONE()
      ? "Модель на этом телефоне недоступна: нужен графический ускоритель с поддержкой LiteRT GPU."
      : "Анализатор недоступен: модель не загружена. Подключите локальный движок с моделью.", true);
    if (res.status === 429 || code === "busy" || code === "engine_busy") return fail("Анализатор занят. Попробуйте ещё раз через минуту.");
    if (code === "duration" || code === "too_long" || code === "duration_limit") return fail("Видео длиннее 30 секунд. Запишите один цикл.");
    if (code === "invalid_video" || res.status === 415 || res.status === 422) return fail("Видео не удалось прочитать. Запишите ещё раз.");
    fail("Анализ не выполнен. Код: " + (code || res.status));
  }
  async function send() {
    if (!(flow.blob || flow.native) || !flow.consent || flow.busy) return;
    flow.busy = true; flow.error = ""; flow.ctrl = new AbortController(); render();
    const res = await engine.analyze(flow.native || flow.blob, flow.type, PHONE() ? "scratch" : store.state.prefs.model, flow.ctrl.signal);
    flow.busy = false; flow.ctrl = null;
    if (res.kind === "ok") return finish(res.data, flow.native ? flow.native.hash : await clipHash(flow.blob));
    explain(res);
  }
  // Phone: the system picker owns the file; only a token, name, type, size and hash come back.
  async function pickNative() {
    if (flow.busy || flow.live) return;
    flow.error = "";
    let res; try { res = await androidBridge.pick(); } catch (_) { res = { kind: "error", status: 503, code: "picker_unavailable" }; }
    if (res.kind === "ok") { releaseNative(); flow.native = res.video; flow.type = res.video.type; flow.step = 3; return render(); }
    if (res.kind === "canceled") return render();
    fail(res.code === "bad_response" ? "Видео не удалось прочитать. Выберите другой файл." : "Не удалось открыть выбор видео.");
  }
  // Phone: the native camera screen records one cycle and returns the final answer itself.
  async function liveNative() {
    if (flow.busy || flow.live) return;
    if (!flow.consent) return fail("Сначала отметьте согласие ниже: видео анализируется на этом телефоне.");
    flow.error = ""; flow.live = true; flow.ctrl = new AbortController(); render();
    let res; try { res = await androidBridge.liveStart("scratch", flow.ctrl.signal); } catch (_) { res = { kind: "error", status: 503, code: "model_unavailable" }; }
    flow.live = false; flow.ctrl = null;
    if (res.kind === "ok") return finish(res.data, res.key);
    if (res.kind === "canceled") return render();
    explain(res);
  }
  const msg = () => flow.error ? '<p role="alert" class="q-msg' + (flow.errorStop ? " q-msg--stop" : "") + '">' + flow.error.replace(/[<&]/g, "") + "</p>" : "";
  function render() {
    paintSteps(); paintStage();
    if (flow.step === 1) {
      card.replaceChildren(...frag('<h2 class="t-l">Посмотрите инструкцию</h2>' +
        '<ol class="steps">' + ["Сядьте боком к камере, чтобы плечо, локоть и запястье были видны целиком.", "Поставьте телефон на уровне локтя, в полутора-двух метрах. Хорошее освещение, однотонный фон, в кадре один человек.", "Выполните ровно одно разгибание локтя от согнутого положения до прямого и обратно.", "Запись не длиннее 30 секунд."].map((t, i) => '<li><span class="q-num">' + (i + 1) + '</span><div><p>' + t + "</p></div></li>").join("") + "</ol>" +
        '<div data-s="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin-top: auto"><a class="q-btn q-btn--ghost" href="#/">Назад</a><button class="q-btn q-btn--cta" type="button" data-act="next">Дальше<span class="q-joint">' + ARROW + "</span></button></div>"));
      card.querySelector("[data-act=next]").addEventListener("click", () => { flow.step = 2; render(); });
      return;
    }
    if (flow.recording) {
      card.replaceChildren(...frag('<h2 class="t-l">Запись одного цикла</h2><video class="q-live" autoplay muted playsinline></video>' +
        '<p class="t-m" data-el="rectime" role="status">' + (flow.recording === "count" ? "Запись начнётся через " + flow.count : "Идёт запись · " + (flow.seconds || 0) + " с из 30") + "</p>" +
        '<div data-s="display: flex; gap: 12px; margin-top: auto"><button class="q-btn q-btn--ghost" type="button" data-act="cancel">Отмена</button>' + (flow.recording === "on" ? '<button class="q-btn q-btn--stop" type="button" data-act="stop">Остановить запись</button>' : "") + "</div>"));
      card.querySelector("video").srcObject = flow.stream;
      card.querySelector("[data-act=cancel]").addEventListener("click", () => { stopCamera(); flow.recording = ""; render(); });
      const stop = card.querySelector("[data-act=stop]"); if (stop) stop.addEventListener("click", () => flow.rec && flow.rec.stop());
      return;
    }
    if (flow.live) {
      card.replaceChildren(...frag('<h2 class="t-l">Камера открыта</h2>' +
        '<p class="t-m" role="status">Сядьте боком и выполните одно разгибание локтя. Запись остановится сама через 30 секунд или по кнопке в окне камеры.</p>' +
        '<div data-s="display: flex; gap: 12px; margin-top: auto"><button class="q-btn q-btn--ghost" type="button" data-act="cancel">Отмена</button></div>'));
      card.querySelector("[data-act=cancel]").addEventListener("click", () => { try { androidBridge.liveCancel().catch(() => {}); } catch (_) {} if (flow.ctrl) flow.ctrl.abort(); });
      return;
    }
    const phone = PHONE(), has = !!(flow.blob || flow.native), ready = has && flow.consent && !flow.busy;
    const bytes = flow.native ? flow.native.size : flow.blob ? flow.blob.size : 0;
    const size = has ? (bytes / 1048576).toFixed(1).replace(".", ",") + " МБ" : "";
    const sources = phone
      ? '<div class="q-drop" data-el="drop" data-s="border-radius: 28px; border: 2px dashed rgba(12,22,51,.28); padding: 32px 24px; display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; background: #F4F6FB"><div data-s="display: flex; flex-wrap: wrap; justify-content: center; gap: 12px"><button class="q-btn" type="button" data-act="live">Снять один цикл</button><button class="q-btn q-btn--white" type="button" data-act="pick">Выбрать видео</button></div><p class="t-2" data-s="font-size: 16px">Камера откроется на весь экран. Из галереи — MP4 или WebM до 30 секунд</p></div>' +
        '<p class="t-small">Чтобы снимать, сначала отметьте согласие ниже. Выбрать готовое видео можно без доступа к камере.</p>'
      : '<div class="q-drop" data-el="drop" data-s="border-radius: 28px; border: 2px dashed rgba(12,22,51,.28); padding: 36px 28px; display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; background: #F4F6FB"><div data-s="display: flex; flex-wrap: wrap; justify-content: center; gap: 12px"><button class="q-btn" type="button" data-act="record">Записать один цикл</button><button class="q-btn q-btn--white" type="button" data-act="pick">Выбрать видео</button></div><p class="t-2" data-s="font-size: 16px">или перетащите файл сюда. MP4 или WebM, до 30 секунд</p><input type="file" accept="video/mp4,video/webm" hidden></div>' +
        '<p class="t-small">Перед записью идёт обратный отсчёт. Камера недоступна? Можно выбрать готовый файл: разрешение камеры для этого не нужно.</p>';
    const where = phone ? "Я понимаю: видео анализируется только на этом телефоне." : 'Я понимаю: видео обрабатывает только локальный анализатор по адресу <span data-el="url"></span>.';
    card.replaceChildren(...frag('<h2 class="t-l">' + (has ? "Отправка на анализ" : "Видео одного цикла") + "</h2>" +
      (has
        ? '<div data-s="border-radius: 28px; padding: 24px 28px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; background: #F4F6FB"><p><strong data-s="font-weight: 600">Выбрано видео</strong><br><span class="t-small">' + (flow.type === "video/mp4" ? "MP4" : "WebM") + " · " + size + '</span></p><button class="q-btn q-btn--small q-btn--white" type="button" data-act="again">Выбрать другое</button></div>'
        : sources) +
      msg() +
      '<label data-s="display: flex; gap: 16px; align-items: flex-start; padding: 20px 22px; border-radius: 20px; background: #F4F6FB; cursor: pointer"><input type="checkbox" data-s="width: 26px; height: 26px; margin: 1px 0 0; flex: none; accent-color: #1F3FE6"><span data-s="font-size: 16px">' + where + ' Оно не сохраняется и не уходит в интернет.</span></label>' +
      '<div data-s="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin-top: auto"><button class="q-btn q-btn--ghost" type="button" data-act="back">' + (flow.busy ? "Отмена" : "Назад") + '</button><button class="q-btn' + (ready ? "" : " is-off") + '" type="button" data-act="send"' + (ready ? "" : ' aria-disabled="true"') + ">" + (flow.busy ? "Анализ…" : "Отправить на анализ") + '<span class="q-joint">' + ARROW + '</span></button><span data-s="font-size: 15px; color: #3A4668">' + (flow.busy ? "" : !has ? "Сначала выберите или запишите видео" : !flow.consent ? "Отметьте согласие, чтобы отправить" : "") + "</span></div>"));
    const urlEl = card.querySelector("[data-el=url]"); if (urlEl) urlEl.textContent = String(store.state.prefs.engineUrl).replace(/^https?:\/\//, "");
    const box = card.querySelector("input[type=checkbox]"); box.checked = flow.consent; box.disabled = flow.busy;
    box.addEventListener("change", () => { flow.consent = box.checked; if (flow.error && flow.consent) flow.error = ""; render(); });
    card.querySelector("[data-act=back]").addEventListener("click", () => { if (flow.busy) return flow.ctrl && flow.ctrl.abort(); flow.error = ""; if (has) { dropClip(); flow.blob = null; releaseNative(); flow.step = 2; } else flow.step = 1; render(); });
    card.querySelector("[data-act=send]").addEventListener("click", send);
    const again = card.querySelector("[data-act=again]"); if (again) again.addEventListener("click", () => { dropClip(); flow.blob = null; releaseNative(); flow.step = 2; flow.error = ""; render(); });
    const drop = card.querySelector("[data-el=drop]");
    if (drop && phone) {
      drop.querySelector("[data-act=pick]").addEventListener("click", pickNative);
      drop.querySelector("[data-act=live]").addEventListener("click", liveNative);
    } else if (drop) {
      const input = drop.querySelector("input[type=file]");
      drop.querySelector("[data-act=pick]").addEventListener("click", () => input.click());
      drop.querySelector("[data-act=record]").addEventListener("click", record);
      input.addEventListener("change", () => take(input.files[0]));
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
      drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); take(e.dataTransfer.files[0]); });
    }
  }
  if (flow.step > 3) flow.step = 1;
  if (flow.step === 3 && !flow.blob && !flow.native) flow.step = 2;
  render();
  return () => {
    stopCamera(); flow.recording = ""; if (flow.ctrl) flow.ctrl.abort();
    if (flow.live) { try { androidBridge.liveCancel().catch(() => {}); } catch (_) {} flow.live = false; }
    if (flow.native) { releaseNative(); if (flow.step === 3) flow.step = 2; }
  };
};

view.result = (root, $) => {
  if (!last) { go("check"); return; }
  const { goal } = store.state.data.profile, { today } = todayStats(), fig = $("fig"), kind = last.label;
  const play = () => {
    if (kind === "complete") { const s = one('<div class="q-sprite fig-side" role="img" aria-label="Фигура повторяет цикл: рука разогнута до прямой" data-s="width: 100%; height: 100%; animation: q-once 1.4s steps(24, jump-none) .3s both"></div>'); fig.replaceChildren(s); }
    else fig.replaceChildren(one('<img alt="' + (kind === "incomplete" ? "Рука разогнута не до конца" : "Полупрозрачная фигура") + '" data-r="' + (kind === "incomplete" ? "fig-side-mid" : "fig-uncertain") + '" data-s="width: 100%; height: 100%; object-fit: contain">'));
  };
  const stage = fig.closest("figure");
  if (last.url && stage) {
    fig.style.visibility = "hidden";
    const tag = { complete: "Выполнено", incomplete: "Проверьте инструкцию", uncertain: "Не оценено уверенно" }[kind] || kind;
    stage.dataset.clip = last.url;
    stage.prepend(...frag('<video class="q-clip" muted playsinline loop autoplay aria-label="Проверенное видео упражнения"></video><span class="q-clip-tag q-clip-tag--' + kind + '"><span class="q-sw f-' + kind + '" data-s="width: 16px; height: 16px"></span>' + tag + '</span>'));
    const v = stage.querySelector("video.q-clip"); v.src = last.url; v.play().catch(() => {});
    const cap = stage.querySelector("figcaption"); if (cap && cap.firstChild && cap.firstChild.nodeType === 3) cap.firstChild.textContent = "Ваше видео, оценено моделью A";
    $("replay").addEventListener("click", () => { v.currentTime = 0; v.play().catch(() => {}); });
  } else { play(); $("replay").addEventListener("click", play); $("replay").hidden = kind !== "complete"; }
  $("added").textContent = last.dup ? "Это видео уже учтено" : "Добавлено в историю";
  const head = $("verdict").querySelector("h2"); head.textContent = LABEL[kind] || kind;
  if (kind !== "complete") { head.style.fontSize = "clamp(34px, 3.6vw, 52px)"; $("verdict").querySelector("svg").replaceWith(one('<span class="q-sw f-' + kind + '" data-s="width: 64px; height: 64px"></span>')); }
  $("lead").textContent = kind === "complete" ? "На записи распознан полный цикл движения." + (last.dup ? " Повтор не засчитан." : " Попытка добавлена в историю.")
    : kind === "incomplete" ? "Полный цикл на записи не распознан. Откройте инструкцию и запишите ещё раз."
    : "Не удалось уверенно оценить. Посмотрите инструкцию ещё раз. В счёт «выполнено» попытка не идёт.";
  ticks($("ticks"), goal, today.total, { empty: "#D5DCEC", emptyOpacity: "1", last: !last.dup });
  $("plan").replaceChildren(...frag('<strong data-s="font-weight: 600">' + today.total + " из " + goal + " на сегодня.</strong> " + (today.total >= goal ? "Цель дня достигнута." : "До цели дня осталось: " + (goal - today.total))));
  const facts = [["Модель", MODEL[last.model] || last.model], ["Где обработано", PHONE() ? "на этом телефоне, видео не сохранено" : "локальный анализатор, видео не сохранено"]];
  if (last.confidence != null) facts.splice(1, 0, ["Уверенность классификатора", Math.round(last.confidence * 100) + "%"]);
  if (last.reason) facts.push(["Причина", { low_confidence: "низкая уверенность", low_visibility: "плохая видимость", unscorable: "нельзя оценить" }[last.reason] || last.reason]);
  $("facts").replaceChildren(...facts.flatMap(([k, v]) => { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.className = "t-3"; dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
};

view.progress = (root, $) => {
  let range = 7;
  const seg = $("range"); [...seg.querySelectorAll("button")].forEach((b) => { b.dataset.v = b.dataset.n; b.removeAttribute("style"); });
  function paint() {
    const { attempts, checkins } = store.state.data, map = byDay(attempts), key = dayKey(new Date()), days = lastDays(range), tot = sum(map, days.map(dayKey));
    $("legend").replaceChildren(...["complete", "incomplete", "uncertain"].map((k) => one('<li data-s="display: flex; align-items: center; gap: 8px"><span class="q-sw f-' + k + '" data-s="width: 16px; height: 16px"></span>' + LABEL[k] + " · " + tot[k] + "</li>")));
    const max = Math.max(1, ...days.map((d) => (map.get(dayKey(d)) || { total: 0 }).total));
    bars($("bars"), $("days"), days, map, Math.min(34, 236 / max), key);
    const heat = $("heat"), weeks = lastDays(35); let active = 0;
    heat.replaceChildren(...weeks.map((d) => { const i = document.createElement("i"), k = dayKey(d); if (map.has(k)) { i.className = k === key ? "now" : "on"; active += 1; } else if (k === key) i.style.boxShadow = "inset 0 0 0 2.5px #0C1633"; i.title = d.getDate() + "." + (d.getMonth() + 1); return i; }));
    heat.setAttribute("aria-label", "Последние 5 недель: дней с занятиями " + active + " из 35");
    const st = streak(map);
    $("stats").replaceChildren(...[[st.current, "серия сейчас", "#1F3FE6"], [st.best, "лучшая серия", ""], [map.size, "дней с занятиями", ""]].map(([n, t, c]) => one('<div><dd class="t-num" data-s="font-size: 46px' + (c ? "; color: " + c : "") + '">' + n + '</dd><dt class="t-small">' + t + "</dt></div>")));
    // Diary of ease: a line through the marked days, dotted across the days without a mark.
    const chart = $("easechart"), ds = lastDays(range), ease = new Map(checkins.filter((c) => c.ease).map((c) => [c.day, c.ease]));
    chart.replaceChildren();
    const g = svgEl("g", { stroke: "#0C1633", "stroke-opacity": ".1", "stroke-width": "1.5" }); g.append(svgEl("path", { d: "M64 20H712M64 60H712M64 100H712M64 140H712M64 180H712" })); chart.append(g);
    for (const [y, text] of [[25, "легко"], [185, "тяжело"]]) { const t = svgEl("text", { x: 0, y, "font-family": "Geologica, sans-serif", "font-size": 14, fill: "#5A6689" }); t.textContent = text; chart.append(t); }
    const pts = ds.map((d, i) => ({ x: 100 + (ds.length > 1 ? (576 * i) / (ds.length - 1) : 288), v: ease.get(dayKey(d)), today: dayKey(d) === key })).filter((p) => p.v);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], gap = Math.round((b.x - a.x) / (576 / Math.max(1, ds.length - 1))) > 1;
      chart.append(svgEl("path", Object.assign({ d: "M" + a.x + " " + (220 - a.v * 40) + "L" + b.x + " " + (220 - b.v * 40), fill: "none", stroke: "#1F3FE6", "stroke-linecap": "round" }, gap ? { "stroke-width": 3, "stroke-dasharray": "2 10" } : { "stroke-width": 5 })));
    }
    for (const p of pts) chart.append(svgEl("circle", p.today ? { cx: p.x, cy: 220 - p.v * 40, r: 11, fill: "#FFBE2E", stroke: "#0C1633", "stroke-width": 3 } : { cx: p.x, cy: 220 - p.v * 40, r: range > 10 ? 6 : 9, fill: "#fff", stroke: "#1F3FE6", "stroke-width": range > 10 ? 4 : 5 }));
    $("easehint").textContent = pts.length ? "Это ваши собственные отметки с экрана «Сегодня». Где отметки не было, линия пунктирная." : "Отметьте самочувствие на экране «Сегодня», и здесь появится линия.";
    const hist = $("hist"), rows = [...attempts].sort((a, b) => b.ts - a.ts).slice(0, 8), yKey = dayKey(new Date(Date.now() - 864e5));
    hist.replaceChildren(...(rows.length ? rows.map((a) => {
      const d = new Date(a.ts), li = one('<li><time></time><span class="q-sw f-' + a.label + '"></span><span></span><em></em><button type="button" aria-label="Удалить запись"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button></li>');
      li.querySelector("time").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      li.children[2].textContent = LABEL[a.label]; li.querySelector("em").textContent = a.day === key ? "сегодня" : a.day === yKey ? "вчера" : d.getDate() + "." + String(d.getMonth() + 1).padStart(2, "0");
      li.querySelector("button").addEventListener("click", () => { store.removeAttempt(a.id); paint(); });
      return li;
    }) : [one('<li class="t-2">Пока нет проверенных циклов. Первый появится здесь после проверки.</li>')]));
  }
  segmented(seg, "7", (v) => { range = +v; paint(); });
  $("print").addEventListener("click", () => window.print());
  paint();
};

view.guide = (root, $) => {
  const chips = [...$("topics").querySelectorAll("button")], tips = [...$("tips").children];
  chips.forEach((chip) => chip.addEventListener("click", () => {
    const topic = chip.textContent.trim();
    chips.forEach((c) => { c.classList.toggle("is-on", c === chip); c.setAttribute("aria-pressed", String(c === chip)); });
    tips.forEach((t) => { t.hidden = topic !== "Все" && t.querySelector("span").textContent.trim() !== topic; });
  }));
};

view.cabinet = (root, $) => {
  const p = store.state.data.profile, prefs = store.state.prefs, nick = root.querySelector("#nick"), url = root.querySelector("#url"), fig = $("armfig");
  nick.value = p.nick || ""; nick.addEventListener("change", () => store.setProfile({ nick: nick.value }));
  const form = nick.closest("form"); form.addEventListener("submit", (e) => e.preventDefault());
  const segs = root.querySelectorAll(".q-seg"); const [l, r] = segs[0].querySelectorAll("button"); l.dataset.v = "left"; r.dataset.v = "right";
  const paintArm = (v) => { fig.src = R[v === "left" ? "fig-front-l" : "fig-front-r"]; };
  segmented(segs[0], p.arm || "right", (v) => { store.setProfile({ arm: v }); paintArm(v); }); paintArm(p.arm || "right");
  stepper(form.querySelector(".q-stepper"), p.goal || 10, (v) => store.setProfile({ goal: v }));
  segmented(segs[1], prefs.model || "scratch", (v) => store.setPrefs({ model: v }));
  const health = $("health");
  const paintHealth = () => health.replaceChildren(one('<span class="q-sw" data-s="width: 12px; height: 12px; background: ' + (engine.state === "ok" ? "#1F3FE6" : engine.state === "nomodel" ? "#FFBE2E" : "#C5221F") + '"></span>'), document.createTextNode(HEALTH_LONG[engine.state]));
  url.value = prefs.engineUrl;
  const test = async () => { store.setPrefs({ engineUrl: url.value.trim() }); health.textContent = "Проверяю связь…"; await engine.check(); paintHealth(); paintStatus(root); };
  $("test").addEventListener("click", test); url.addEventListener("change", test); paintHealth();
  // The phone analyses on its own GPU: there is no engine address to set.
  if (!profile.engineSettings) { const row = url.closest(".q-field")?.parentElement; if (row) row.hidden = true; }
  const [calmBtn, keepBtn] = root.querySelectorAll(".q-toggle");
  toggle(calmBtn, prefs.calm, (v) => { store.setPrefs({ calm: v }); document.documentElement.classList.toggle("calm", v); });
  toggle(keepBtn, prefs.persist, (v) => store.setPrefs({ persist: v }));
  const stored = $("stored"), paintStored = () => { const d = store.state.data; stored.textContent = "Сейчас в истории: " + cycles(d.attempts.length) + ", отметок самочувствия: " + d.checkins.filter((c) => c.ease).length + "."; };
  paintStored();
  $("export").addEventListener("click", () => {
    if (PHONE()) { androidBridge.exportData(store.exportData(), "qolda-" + dayKey(new Date()) + ".json").catch(() => {}); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(store.exportData(), null, 2)], { type: "application/json" }));
    a.download = "qolda-" + dayKey(new Date()) + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const wipe = $("wipe"); let armed = false;
  wipe.addEventListener("click", () => {
    if (!armed) { armed = true; wipe.textContent = "Точно удалить? Нажмите ещё раз"; setTimeout(() => { armed = false; wipe.textContent = "Удалить все данные"; }, 4000); return; }
    store.wipe(); store.setPrefs({ onboarded: false }); go("welcome");
  });
};

// ---------- router ----------
const ROUTES = { "": "today", welcome: "welcome", check: "check", result: "result", progress: "progress", guide: "guide", cabinet: "cabinet" };
let dispose = null, current = "";
const path = () => location.hash.replace(/^#\/?/, "").split("?")[0];
function go(to) { if (path() === to && location.hash.startsWith("#/")) render(); else location.hash = "#/" + to; }
function render() {
  let want = path(); if (!(want in ROUTES)) want = "";
  const name = store.state.prefs.onboarded ? (want === "welcome" ? "" : want) : "welcome";
  if (dispose) { dispose(); dispose = null; }
  const screen = ROUTES[name], doc = new DOMParser().parseFromString(SCREENS[screen === "welcome" ? "main" : screen], "text/html");
  const root = hydrate(document.importNode(doc.body.firstElementChild, true));
  const $ = (el) => root.querySelector('[data-el="' + el + '"]');
  for (const a of root.querySelectorAll('a[href^="#"]')) {
    const href = a.getAttribute("href");
    if (!href.startsWith("#/")) a.addEventListener("click", (e) => { e.preventDefault(); const t = root.querySelector(href === "#top" ? "header" : href); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }
  app.replaceChildren(root);
  paintStatus(root);
  langSwitch(root);
  dispose = view[screen](root, $) || null;
  // On a phone the nav is one sideways-scrolling row: bring the current section into view.
  const nav = root.querySelector(".q-nav:not(.hero-nav)"), on = nav && nav.querySelector(".is-on");
  if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft += on.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - on.offsetWidth) / 2;
  if (current !== name) window.scrollTo(0, 0);
  current = name;
  document.title = tr(({ welcome: "Знакомство", today: "Сегодня", check: "Проверка", result: "Результат", progress: "Прогресс", guide: "Памятка", cabinet: "Кабинет" })[screen]) + " · Qolda";
  localize(root);
}
/** The artboards' Рус/Қаз control: shown in the landing nav and added to every app nav. */
function langSwitch(root) {
  for (const nav of root.querySelectorAll(".q-nav")) {
    let sw = nav.querySelector(".q-lang");
    if (!sw) {
      sw = one('<span class="q-lang" role="group" aria-label="Язык"><button type="button">Рус</button><button type="button">Қаз</button></span>');
      const status = nav.querySelector(".q-status"); if (status) nav.insertBefore(sw, status); else nav.append(sw);
    }
    sw.hidden = false;
    const [ru, kk] = sw.querySelectorAll("button");
    [[ru, "ru"], [kk, "kk"]].forEach(([b, code]) => {
      const on = code === lang(); b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); b.lang = code;
      b.addEventListener("click", () => { if (code === lang()) return; store.setPrefs({ lang: code }); setLang(code); render(); });
    });
  }
}
setLang(store.state.prefs.lang);
watch(app);
document.documentElement.classList.toggle("calm", !!store.state.prefs.calm);
engine.on(() => paintStatus(app));
window.addEventListener("hashchange", render);
window.addEventListener("focus", () => engine.check());
render();
engine.check();
