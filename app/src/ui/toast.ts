export function toast(msg: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("on");
  window.clearTimeout((el as unknown as { _tm?: number })._tm);
  (el as unknown as { _tm?: number })._tm = window.setTimeout(() => el.classList.remove("on"), 2500);
}
