// Minimal renderer for the *.dc.html mockups (so they can be opened and screenshotted).
// Fills {{holes}} from renderVals(), expands <sc-for list as> and <sc-if value>, moves <helmet> into <head>.
class DCLogic { constructor(props) { this.props = props || {}; } }
window.DCLogic = DCLogic;
document.addEventListener("DOMContentLoaded", () => {
  const s = document.querySelector('script[type="text/x-dc"]');
  const props = {};
  try { const d = JSON.parse(s.dataset.props || "{}"); for (const k in d) if (d[k] && "default" in d[k]) props[k] = d[k].default; } catch {}
  const Component = new Function("DCLogic", s.textContent + "; return Component;")(DCLogic);
  const vals = new Component(props).renderVals();
  const get = (path, scope) => path.trim().split(".").reduce((o, k) => (o == null ? undefined : o[k]), scope);
  const lit = (p) => (p === "true" ? true : p === "false" ? false : undefined);
  const fill = (str, scope) => str.replace(/\{\{([^}]+)\}\}/g, (_, p) => { const l = lit(p.trim()); const v = l !== undefined ? l : get(p, scope); return v == null ? "" : String(v); });
  const holeOf = (attr) => (/^\{\{(.+)\}\}$/.exec((attr || "").trim()) || [])[1];
  function expand(node, scope) {
    for (const el of [...node.children]) {
      if (el.tagName === "SC-FOR") {
        const list = get(holeOf(el.getAttribute("list")) || "", scope) || [];
        const as = el.getAttribute("as");
        const frag = document.createDocumentFragment();
        for (const item of list) {
          const t = document.createElement("div");
          t.innerHTML = el.innerHTML;
          const sc = Object.assign(Object.create(scope), { [as]: item });
          expand(t, sc);
          t.innerHTML = fill(t.innerHTML, sc);
          while (t.firstChild) frag.appendChild(t.firstChild);
        }
        el.replaceWith(frag);
      } else if (el.tagName === "SC-IF") {
        const p = holeOf(el.getAttribute("value")) || "";
        const v = lit(p) !== undefined ? lit(p) : get(p, scope);
        if (v) { expand(el, scope); el.replaceWith(...el.childNodes); } else el.remove();
      } else expand(el, scope);
    }
  }
  const root = document.querySelector("x-dc");
  const helmet = root.querySelector("helmet");
  if (helmet) { document.head.insertAdjacentHTML("beforeend", fill(helmet.innerHTML, vals)); helmet.remove(); }
  expand(root, vals);
  root.innerHTML = fill(root.innerHTML, vals);
  root.style.display = "block";
});
