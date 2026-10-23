/** Where «رجوع للشات» goes: the case's own page (its chat) or Home, keeping the open session. Shared by the shell and «اسأل Clausia» (it closes the sheet). */
export function closeHref(path: string, sp: URLSearchParams): string {
  const m = path.match(/^\/cases\/([^/]+)/);
  const keep = new URLSearchParams();
  for (const k of m ? ["s", "hearing"] : ["s"]) { const v = sp.get(k); if (v) keep.set(k, v); }
  const q = keep.toString();
  return `${m ? `/cases/${m[1]}` : "/"}${q ? `?${q}` : ""}`;
}
