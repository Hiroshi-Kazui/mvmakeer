import { confirm, message } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getState, subscribe, setProject, markSaved } from "./state";
import { initMaterialsPanel } from "./ui/materials";
import { saveProjectAs, saveProjectTo, openProject, checkMissingAssets } from "./logic/projectFileIO";
import { initPreviewEngine } from "./preview/engine";
import { initInspector } from "./ui/inspector";
import { initTelopActions } from "./ui/telopActions";
import { initTimeline } from "./ui/timeline";
import { initExportPanel } from "./ui/exportPanel";
import { toast, errorMessage } from "./ui/toast";

function fmtTimecode(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
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

  const btnExport = document.getElementById("btnExport") as HTMLButtonElement | null;
  if (btnExport) btnExport.disabled = !hasAudio || project.images.length === 0;

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

/** ヘッダーのプロジェクト名クリックでインライン編集(Enter/フォーカスアウトで確定、Escで取消)。 */
function initProjectRename(): void {
  const box = document.getElementById("projectNameBox");
  const label = document.getElementById("projectName");
  const input = document.getElementById("projectNameInput") as HTMLInputElement | null;
  if (!box || !label || !input) return;

  const beginEdit = (): void => {
    if (input.style.display !== "none") return;
    input.value = getState().project.name;
    label.style.display = "none";
    input.style.display = "inline-block";
    input.focus();
    input.select();
  };

  const endEdit = (commit: boolean): void => {
    if (input.style.display === "none") return;
    input.style.display = "none";
    label.style.display = "";
    const name = input.value.trim();
    const { project } = getState();
    if (commit && name && name !== project.name) {
      setProject({ ...project, name });
    }
  };

  box.addEventListener("click", beginEdit);
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") endEdit(true);
    else if (e.key === "Escape") endEdit(false);
  });
  input.addEventListener("blur", () => endEdit(true));
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
    toast(`保存に失敗しました: ${errorMessage(e)}`);
  }
}

async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!getState().dirty) return true;
  return confirm("保存されていない変更があります。破棄してよろしいですか?", {
    title: "未保存の変更",
    kind: "warning",
  });
}

async function handleOpen(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  try {
    const result = await openProject();
    if (!result) return;
    currentPath = result.path;
    setProject(result.project, false);
    markSaved(result.path);
    toast("プロジェクトを開きました");

    const missing = await checkMissingAssets(result.project);
    if (missing.length > 0) {
      await message(`以下の素材ファイルが見つかりません。左パネルから再指定してください。\n\n${missing.join("\n")}`, {
        title: "素材が見つかりません",
        kind: "warning",
      });
    }
  } catch (e) {
    toast(`読み込みに失敗しました: ${errorMessage(e)}`);
  }
}

function initCloseGuard(): void {
  void getCurrentWindow().onCloseRequested(async (event) => {
    if (!getState().dirty) return;
    event.preventDefault();
    const ok = await confirm("保存されていない変更があります。保存せずに終了しますか?", {
      title: "未保存の変更",
      kind: "warning",
    });
    if (ok) await getCurrentWindow().destroy();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initMaterialsPanel();
  initHeaderActions();
  initProjectRename();
  initPreviewEngine();
  initInspector();
  initTelopActions();
  initTimeline();
  initExportPanel();
  initCloseGuard();
  subscribe(updateHeaderAndTransport);
  updateHeaderAndTransport();
});
