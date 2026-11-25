// Interface language. The screens and the logic are written in Russian; in Kazakh every text node
// and accessible attribute is swapped for its translation (kk.js) as soon as it appears, before paint.
import { KK, KK_PATTERNS } from "./kk.js";

let current = "ru";
const CYR = /[А-Яа-яЁё]/;
const ATTRS = ["alt", "aria-label", "title", "placeholder"];
const norm = (s) => s.replace(/\s+/g, " ").trim();

export const lang = () => current;
export function setLang(value) {
  current = value === "kk" ? "kk" : "ru";
  document.documentElement.lang = current;
}

/** Translate one string; anything without a translation stays as it is. */
export function tr(text) {
  if (current !== "kk" || !text || !CYR.test(text)) return text;
  const key = norm(text);
  let out = KK[key];
  if (out == null) for (const [re, fn] of KK_PATTERNS) { const m = key.match(re); if (m) { out = fn(m); if (out != null) break; } }
  if (out == null) return text;
  return text.match(/^\s*/)[0] + out + text.match(/\s*$/)[0];
}

export function localize(node) {
  if (current !== "kk" || !node) return;
  if (node.nodeType === 3) {
    const v = node.nodeValue, t = tr(v);
    if (t !== v) node.nodeValue = t;
    return;
  }
  if (node.nodeType !== 1 || node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
  for (const a of ATTRS) {
    const v = node.getAttribute(a);
    if (v && CYR.test(v)) { const t = tr(v); if (t !== v) node.setAttribute(a, t); }
  }
  for (const child of node.childNodes) localize(child);
}

/** Keep a subtree translated while screens re-render and update their numbers. */
export function watch(root) {
  new MutationObserver((records) => {
    if (current !== "kk") return;
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(localize);
      else localize(r.target);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
