import { confirm } from "@tauri-apps/plugin-dialog";
import type { Telop } from "../types";
import { DEFAULT_TELOP_STYLE, DEFAULT_FADE_IN_DUR, DEFAULT_FADE_OUT_DUR } from "../types";
import { getState, setProject, selectTelop } from "../state";
import { insertTelop as insertTelopIntoList, setFadeOutAt } from "../logic/timing";
import { focusInspectorText } from "./inspector";

const INITIAL_VISIBLE_DURATION = 3.0;

function nextTelopId(telops: Telop[]): number {
  return telops.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

function createTelopAt(time: number, telops: Telop[]): Telop {
  return {
    id: nextTelopId(telops),
    text: "",
    timeIn: time,
    fadeInDur: DEFAULT_FADE_IN_DUR,
    fadeOutStart: time + INITIAL_VISIBLE_DURATION,
    fadeOutDur: DEFAULT_FADE_OUT_DUR,
    style: { ...DEFAULT_TELOP_STYLE },
  };
}

function insertAtCurrentTime(): void {
  const { project, currentTime } = getState();
  if (!project.audio) return;
  const newTelop = createTelopAt(currentTime, project.telops);
  const telops = insertTelopIntoList(project.telops, newTelop);
  setProject({ ...project, telops });
  selectTelop(newTelop.id);
  focusInspectorText();
}

function fadeOutSelectedAtCurrentTime(): void {
  const { project, currentTime, selectedTelopId } = getState();
  if (selectedTelopId === null) return;
  const telops = setFadeOutAt(project.telops, selectedTelopId, currentTime);
  setProject({ ...project, telops });
}

async function deleteSelected(): Promise<void> {
  const { project, selectedTelopId } = getState();
  if (selectedTelopId === null) return;
  const target = project.telops.find((t) => t.id === selectedTelopId);
  if (!target) return;

  const label = target.text.trim() || "(空のテロップ)";
  const ok = await confirm(`「${label}」を削除しますか?`, { title: "削除の確認", kind: "warning" });
  if (!ok) return;

  const telops = project.telops.filter((t) => t.id !== selectedTelopId);
  setProject({ ...project, telops });
  selectTelop(null);
}

export function initTelopActions(): void {
  document.getElementById("btnInsert")?.addEventListener("click", insertAtCurrentTime);
  document.getElementById("btnFadeOut")?.addEventListener("click", fadeOutSelectedAtCurrentTime);
  document.getElementById("btnDelete")?.addEventListener("click", () => void deleteSelected());

  document.addEventListener("keydown", (e) => {
    if (!getState().project.audio) return;
    const target = e.target as HTMLElement;
    if (target.matches("textarea, input, select")) return;

    if (e.key === "i" || e.key === "I") {
      insertAtCurrentTime();
    } else if (e.key === "o" || e.key === "O") {
      fadeOutSelectedAtCurrentTime();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      void deleteSelected();
    }
  });
}
