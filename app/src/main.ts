import { getState, subscribe, setProject, markSaved } from "./state";
import { initMaterialsPanel } from "./ui/materials";
import { saveProjectAs, saveProjectTo, openProject } from "./logic/projectFileIO";
import { initPreviewEngine } from "./preview/engine";
import { initInspector } from "./ui/inspector";
import { initTelopActions } from "./ui/telopActions";

function fmtTimecode(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

function toast(msg: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("on");
  window.clearTimeout((el as unknown as { _tm?: number })._tm);
  (el as unknown as { _tm?: number })._tm = window.setTimeout(() => el.classList.remove("on"), 2000);
}

function updateHeaderAndTransport(): void {
  const { project, dirty } = getState();
  const nameEl = document.getElementById("projectName");
  if (nameEl) nameEl.textContent = project.name + (dirty ? " *" : "");

  const hasAudio = project.audio !== null;
  const tcDur = document.getElementById("tcDur");
  if (tcDur) tcDur.textContent = hasAudio ? fmtTimecode(project.audio!.duration) : "00:00.0";

  for (const id of ["btnPrev", "btnPlay", "btnNext", "btnInsert"]) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = !hasAudio;
  }

  const status = document.getElementById("statusMsg");
  if (status) {
    status.textContent = hasAudio
      ? "タイムライン上のブロックはドラッグで移動、両端と O マーカーはドラッグで調整できます"
      : "画像と音声を追加してください";
  }
}

function initHeaderActions(): void {
  document.getElementById("btnSave")?.addEventListener("click", () => void handleSave());
  document.getElementById("btnOpen")?.addEventListener("click", () => void handleOpen());
}

let currentPath: string | null = null;

async function handleSave(): Promise<void> {
  const { project } = getState();
  try {
    if (currentPath) {
      await saveProjectTo(project, currentPath);
    } else {
      const path = await saveProjectAs(project);
      if (!path) return;
      currentPath = path;
    }
    markSaved(currentPath!);
    toast("プロジェクトを保存しました");
  } catch (e) {
    toast(`保存に失敗しました: ${(e as Error).message}`);
  }
}

async function handleOpen(): Promise<void> {
  try {
    const result = await openProject();
    if (!result) return;
    currentPath = result.path;
    setProject(result.project, false);
    markSaved(result.path);
    toast("プロジェクトを開きました");
  } catch (e) {
    toast(`読み込みに失敗しました: ${(e as Error).message}`);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initMaterialsPanel();
  initHeaderActions();
  initPreviewEngine();
  initInspector();
  initTelopActions();
  subscribe(updateHeaderAndTransport);
  updateHeaderAndTransport();
});
