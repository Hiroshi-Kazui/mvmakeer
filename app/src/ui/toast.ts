/** catch(e) の e は Error とは限らない(Tauri invoke は文字列で reject することがある)。 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export function toast(msg: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("on");
  window.clearTimeout((el as unknown as { _tm?: number })._tm);
  (el as unknown as { _tm?: number })._tm = window.setTimeout(() => el.classList.remove("on"), 2500);
}
