/** Upload limits and the Storage-safe file name (shared by the action, the upload control and scripts). */

export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const MAX_BYTES = 25 * 1024 * 1024;
export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** ASCII-only object name for Storage (Arabic names stay in documents.file_name). */
export function safeFileName(name: string, mime: string): string {
  const ext = EXT[mime] ?? "bin";
  const base = name.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "document"}.${ext}`;
}
