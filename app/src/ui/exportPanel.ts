import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { tempDir, join } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getState } from "../state";
import { buildAssContent } from "../export/assBuilder";
import { buildFfmpegArgs } from "../export/ffmpegCommand";
import { toast } from "./toast";

function fmtTimecode(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

function showOverlay(): void {
  const el = document.getElementById("exportOverlay");
  if (el) el.style.display = "flex";
}

function hideOverlay(): void {
  const el = document.getElementById("exportOverlay");
  if (el) el.style.display = "none";
}

function setProgress(currentMs: number, totalMs: number): void {
  const fill = document.getElementById("exportProgressFill");
  const text = document.getElementById("exportProgressText");
  const pct = totalMs > 0 ? Math.min(100, (currentMs / totalMs) * 100) : 0;
  if (fill) fill.style.width = `${pct}%`;
  if (text) text.textContent = `${fmtTimecode(currentMs / 1000)} / ${fmtTimecode(totalMs / 1000)}`;
}

async function runExport(): Promise<void> {
  const { project } = getState();
  if (!project.audio || project.images.length === 0) return;

  const outputPath = await save({
    filters: [{ name: "MP4 動画", extensions: ["mp4"] }],
    defaultPath: `${project.name}.mp4`,
  });
  if (!outputPath) return;

  let plan: ReturnType<typeof buildFfmpegArgs>;
  let assFilePath: string;
  try {
    const dir = await tempDir();
    assFilePath = await join(dir, `mvmaker-${Date.now()}.ass`);
    plan = buildFfmpegArgs(project, assFilePath, outputPath);
  } catch (e) {
    toast(`書き出し準備に失敗しました: ${(e as Error).message}`);
    return;
  }

  const assContent = buildAssContent(project.telops);
  const totalMs = plan.totalDuration * 1000;

  setProgress(0, totalMs);
  showOverlay();

  let unlistenProgress: UnlistenFn | null = null;
  let unlistenEnd: UnlistenFn | null = null;

  try {
    unlistenProgress = await listen<number>("export-progress", (event) => {
      setProgress(event.payload, totalMs);
    });
    unlistenEnd = await listen("export-progress-end", () => {
      setProgress(totalMs, totalMs);
    });

    await invoke("export_video", {
      args: plan.args,
      assPath: assFilePath,
      assContent,
    });

    hideOverlay();
    toast("書き出しが完了しました");
    await revealItemInDir(outputPath).catch(() => undefined);
  } catch (e) {
    hideOverlay();
    toast(`書き出しに失敗しました: ${(e as Error).message ?? String(e)}`);
  } finally {
    unlistenProgress?.();
    unlistenEnd?.();
  }
}

async function cancelExport(): Promise<void> {
  try {
    await invoke("cancel_export");
  } catch {
    // no-op: キャンセル失敗は致命的でない
  }
  hideOverlay();
  toast("書き出しをキャンセルしました");
}

export function initExportPanel(): void {
  document.getElementById("btnExport")?.addEventListener("click", () => void runExport());
  document.getElementById("btnExportCancel")?.addEventListener("click", () => void cancelExport());
}
