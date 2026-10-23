/** Where «رجوع للشات» goes: the case's or the client's own page (its chat) or Home, keeping the open session. Shared by the shell and «اسأل Clausia» (it closes the sheet). */
export function closeHref(path: string, sp: URLSearchParams): string {
  const m = path.match(/^\/(cases|clients)\/([^/]+)/);
  const keep = new URLSearchParams();
  for (const k of m?.[1] === "cases" ? ["s", "hearing"] : ["s"]) { const v = sp.get(k); if (v) keep.set(k, v); }
  const q = keep.toString();
  return `${m ? `/${m[1]}/${m[2]}` : "/"}${q ? `?${q}` : ""}`;
}
