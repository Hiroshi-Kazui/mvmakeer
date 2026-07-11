import type { Telop, TelopPosition } from "../types";
import { getState, setProject, subscribe } from "../state";
import { normalizeTelop, setFadeOutAt, setTelopStart } from "../logic/timing";

const POSITIONS: TelopPosition[] = [
  "top-left", "top-center", "top-right",
  "middle-left", "middle-center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
];

function fmtSeconds(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

function selectedTelop(): Telop | null {
  const { project, selectedTelopId } = getState();
  return project.telops.find((t) => t.id === selectedTelopId) ?? null;
}

function updateSelected(patch: Partial<Telop>): void {
  const { project, selectedTelopId } = getState();
  if (selectedTelopId === null) return;
  const telops = project.telops.map((t) =>
    t.id === selectedTelopId ? normalizeTelop({ ...t, ...patch }) : t,
  );
  setProject({ ...project, telops });
}

function updateSelectedStyle(patch: Partial<Telop["style"]>): void {
  const t = selectedTelop();
  if (!t) return;
  updateSelected({ style: { ...t.style, ...patch } });
}

let posGridBuilt = false;

function buildPositionGrid(): void {
  if (posGridBuilt) return;
  const grid = document.getElementById("posGrid");
  if (!grid) return;
  POSITIONS.forEach((pos) => {
    const btn = document.createElement("button");
    btn.dataset.position = pos;
    btn.addEventListener("click", () => updateSelectedStyle({ position: pos }));
    grid.appendChild(btn);
  });
  posGridBuilt = true;
}

export function focusInspectorText(): void {
  const el = document.getElementById("inspText") as HTMLTextAreaElement | null;
  el?.focus();
}

function wireStaticControls(): void {
  document.getElementById("inspText")?.addEventListener("input", (e) => {
    updateSelected({ text: (e.target as HTMLTextAreaElement).value });
  });
  document.getElementById("inspFont")?.addEventListener("change", (e) => {
    updateSelectedStyle({ font: (e.target as HTMLSelectElement).value });
  });
  document.getElementById("inspSize")?.addEventListener("change", (e) => {
    const size = parseFloat((e.target as HTMLInputElement).value);
    if (!Number.isNaN(size) && size > 0) updateSelectedStyle({ size });
  });

  document.querySelectorAll<HTMLElement>("#colorSwatches .swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      const color = sw.dataset.color;
      if (color) updateSelectedStyle({ color });
    });
  });

  document.querySelectorAll<HTMLElement>(".stepper button[data-d]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.closest<HTMLElement>(".stepper")?.dataset.key as keyof Telop | undefined;
      const delta = parseFloat(btn.dataset.d ?? "0");
      const t = selectedTelop();
      if (!key || !t) return;
      const current = t[key];
      if (typeof current !== "number") return;
      updateSelected({ [key]: Math.max(0, current + delta) } as Partial<Telop>);
    });
  });

  // 「現在位置」: 再生ヘッドの時刻を表示開始 / フェードアウト開始に設定する。
  // クランプはタイムラインのハンドルドラッグと同じ logic/timing.ts の関数に委ねる。
  document.getElementById("btnTimeInNow")?.addEventListener("click", () => {
    const { project, selectedTelopId, currentTime } = getState();
    if (selectedTelopId === null) return;
    setProject({ ...project, telops: setTelopStart(project.telops, selectedTelopId, currentTime) });
  });
  document.getElementById("btnFadeOutNow")?.addEventListener("click", () => {
    const { project, selectedTelopId, currentTime } = getState();
    if (selectedTelopId === null) return;
    setProject({ ...project, telops: setFadeOutAt(project.telops, selectedTelopId, currentTime) });
  });
}

function render(): void {
  const t = selectedTelop();
  const empty = document.getElementById("inspEmpty");
  const body = document.getElementById("inspBody");
  const btnFadeOut = document.getElementById("btnFadeOut") as HTMLButtonElement | null;
  const btnDelete = document.getElementById("btnDelete") as HTMLButtonElement | null;

  if (empty) empty.style.display = t ? "none" : "block";
  if (body) body.style.display = t ? "block" : "none";
  if (btnFadeOut) btnFadeOut.disabled = !t;
  if (btnDelete) btnDelete.disabled = !t;
  if (!t) return;

  const textEl = document.getElementById("inspText") as HTMLTextAreaElement | null;
  if (textEl && document.activeElement !== textEl) textEl.value = t.text;

  const fontEl = document.getElementById("inspFont") as HTMLSelectElement | null;
  if (fontEl && document.activeElement !== fontEl) fontEl.value = t.style.font;

  const sizeEl = document.getElementById("inspSize") as HTMLInputElement | null;
  if (sizeEl && document.activeElement !== sizeEl) sizeEl.value = String(t.style.size);

  document.querySelectorAll<HTMLElement>("#colorSwatches .swatch").forEach((sw) => {
    sw.classList.toggle("on", sw.dataset.color === t.style.color);
  });

  document.querySelectorAll<HTMLElement>("#posGrid button").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.position === t.style.position);
  });

  document.querySelectorAll<HTMLElement>(".stepper").forEach((stepper) => {
    const key = stepper.dataset.key as keyof Telop | undefined;
    const valEl = stepper.querySelector<HTMLElement>(".val");
    if (!key || !valEl) return;
    const v = t[key];
    if (typeof v === "number") valEl.textContent = fmtSeconds(v);
  });
}

export function initInspector(): void {
  buildPositionGrid();
  wireStaticControls();
  subscribe(render);
  render();
}
