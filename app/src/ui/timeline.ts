import { convertFileSrc } from "@tauri-apps/api/core";
import type { ImageEntry, Telop } from "../types";
import { getState, subscribe, subscribeTime, setProject, selectTelop } from "../state";
import {
  adjustImageBoundary,
  moveTelop,
  setTelopStart,
  setTelopEnd,
  setFadeOutAt,
  telopVisibleEnd,
} from "../logic/timing";
import { previewWithOverrides, seekTo } from "../preview/engine";
import { extractPeaks, renderWaveformSvg } from "../preview/waveform";

const LABEL_WIDTH = 90;

function trackWidth(): number {
  const lanes = document.getElementById("lanes");
  return lanes ? Math.max(0, lanes.clientWidth - LABEL_WIDTH) : 0;
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function fmtShort(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fmtTimecode(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

// ============ ルーラー / プレイヘッド ============

let lastRulerDuration = -1;

function renderRuler(duration: number): void {
  if (duration === lastRulerDuration) return;
  lastRulerDuration = duration;
  const ruler = document.getElementById("ruler");
  if (!ruler) return;
  ruler.innerHTML = "";
  if (duration <= 0) return;

  const step = duration > 120 ? 30 : duration > 30 ? 15 : 5;
  for (let s = 0; s <= duration; s += step) {
    const tick = document.createElement("div");
    tick.className = "tick";
    tick.style.left = `${(s / duration) * 100}%`;
    tick.textContent = fmtShort(s);
    ruler.appendChild(tick);
  }
}

function renderPlayhead(t: number, duration: number): void {
  const ph = document.getElementById("playhead");
  if (!ph) return;
  const pct = duration > 0 ? t / duration : 0;
  ph.style.left = `${trackWidth() * pct}px`;
  ph.dataset.t = fmtTimecode(t);
}

function wireRulerScrub(): void {
  const ruler = document.getElementById("ruler");
  if (!ruler) return;
  const seekFromEvent = (e: MouseEvent) => {
    const rect = ruler.getBoundingClientRect();
    const ratio = clampPct(((e.clientX - rect.left) / rect.width) * 100) / 100;
    const duration = getState().project.audio?.duration ?? 0;
    seekTo(ratio * duration);
  };
  ruler.addEventListener("mousedown", (e) => {
    seekFromEvent(e);
    const onMove = (ev: MouseEvent) => seekFromEvent(ev);
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// ============ テロップクリップ ============

function assignLanes(telops: Telop[]): Map<number, number> {
  const sorted = [...telops].sort((a, b) => a.timeIn - b.timeIn);
  const laneEnds: number[] = [];
  const laneOf = new Map<number, number>();
  for (const tp of sorted) {
    let lane = laneEnds.findIndex((end) => end <= tp.timeIn + 0.01);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = telopVisibleEnd(tp);
    laneOf.set(tp.id, lane);
  }
  return laneOf;
}

function clipHtml(tp: Telop, duration: number, active: boolean): string {
  const end = telopVisibleEnd(tp);
  const l = (tp.timeIn / duration) * 100;
  const w = ((end - tp.timeIn) / duration) * 100;
  const foPct = clampPct(((tp.fadeOutStart - tp.timeIn) / Math.max(1e-6, end - tp.timeIn)) * 100);
  const label = escapeHtml(tp.text.replace(/\n/g, " ") || "(空のテロップ)");
  return `<div class="clip ${active ? "active" : ""}" data-id="${tp.id}" style="left:${l}%;width:${w}%">
    <div class="h in" data-h="in"></div>
    <div class="body">${label}</div>
    <div class="fadezone" style="width:${100 - foPct}%"></div>
    <div class="h fo" data-h="fo" style="left:calc(${foPct}% - 7px)"></div>
    <div class="h end" data-h="end"></div>
  </div>`;
}

function applyClipStyle(clipEl: HTMLElement, tp: Telop, duration: number): void {
  const end = telopVisibleEnd(tp);
  const l = (tp.timeIn / duration) * 100;
  const w = ((end - tp.timeIn) / duration) * 100;
  const foPct = clampPct(((tp.fadeOutStart - tp.timeIn) / Math.max(1e-6, end - tp.timeIn)) * 100);
  clipEl.style.left = `${l}%`;
  clipEl.style.width = `${w}%`;
  const fadezone = clipEl.querySelector<HTMLElement>(".fadezone");
  if (fadezone) fadezone.style.width = `${100 - foPct}%`;
  const foHandle = clipEl.querySelector<HTMLElement>(".h.fo");
  if (foHandle) foHandle.style.left = `calc(${foPct}% - 7px)`;
}

function bindClipDrag(clipEl: HTMLElement, id: number, duration: number): void {
  clipEl.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    const handle = (e.target as HTMLElement).dataset.h as "in" | "fo" | "end" | undefined;
    selectTelop(id);

    const base = getState().project.telops;
    const telop = base.find((t) => t.id === id);
    if (!telop) return;

    const pxPerSec = trackWidth() / duration;
    const startX = e.clientX;
    const start = { timeIn: telop.timeIn, fadeOutStart: telop.fadeOutStart, fadeOutDur: telop.fadeOutDur };
    let latest = base;

    const onMove = (ev: MouseEvent) => {
      const dt = (ev.clientX - startX) / pxPerSec;
      if (!handle) latest = moveTelop(base, id, start.timeIn + dt);
      else if (handle === "in") latest = setTelopStart(base, id, start.timeIn + dt);
      else if (handle === "fo") latest = setFadeOutAt(base, id, start.fadeOutStart + dt);
      else if (handle === "end") latest = setTelopEnd(base, id, start.fadeOutStart + start.fadeOutDur + dt);

      previewWithOverrides({ telops: latest });
      const t = latest.find((x) => x.id === id);
      if (t) applyClipStyle(clipEl, t, duration);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const { project } = getState();
      setProject({ ...project, telops: latest });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// ============ 画像トラック ============

function imageClipHtml(im: ImageEntry, index: number, images: ImageEntry[], duration: number): string {
  const start = images.slice(0, index).reduce((s, x) => s + x.duration, 0);
  const l = (start / duration) * 100;
  const w = (im.duration / duration) * 100;
  const hasBoundary = index < images.length - 1;
  return `<div class="img-clip" data-index="${index}" style="left:${l}%;width:${w}%;background-image:url('${convertFileSrc(im.path)}')">
    <span>${escapeHtml(basename(im.path))}</span>
    ${hasBoundary ? `<div class="img-boundary" data-boundary="${index}"></div>` : ""}
  </div>`;
}

function renderImageTrackLive(images: ImageEntry[], duration: number): void {
  const track = document.getElementById("imageTrack");
  if (!track) return;
  let acc = 0;
  const els = track.querySelectorAll<HTMLElement>(".img-clip");
  images.forEach((im, i) => {
    const el = els[i];
    if (el) {
      el.style.left = `${(acc / duration) * 100}%`;
      el.style.width = `${(im.duration / duration) * 100}%`;
    }
    acc += im.duration;
  });
}

function bindImageBoundaries(duration: number): void {
  document.querySelectorAll<HTMLElement>("#imageTrack [data-boundary]").forEach((handle) => {
    const index = Number(handle.dataset.boundary);
    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      const pxPerSec = trackWidth() / duration;
      const startX = e.clientX;
      const base = getState().project.images;
      let latest = base;

      const onMove = (ev: MouseEvent) => {
        const dt = (ev.clientX - startX) / pxPerSec;
        latest = adjustImageBoundary(base, index, dt);
        previewWithOverrides({ images: latest });
        renderImageTrackLive(latest, duration);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const { project } = getState();
        setProject({ ...project, images: latest });
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

// ============ 波形 ============

let waveformCache: { path: string; peaks: number[] | null } | null = null;

async function ensureWaveform(path: string): Promise<void> {
  if (waveformCache?.path === path) return;
  const peaks = await extractPeaks(path);
  waveformCache = { path, peaks };
}

// ============ レーン全体 ============

function renderLanes(): void {
  const { project, selectedTelopId } = getState();
  const lanesEl = document.getElementById("lanes");
  if (!lanesEl) return;
  const duration = project.audio?.duration ?? 0;

  if (duration <= 0) {
    lanesEl.innerHTML = "";
    return;
  }

  const laneOf = assignLanes(project.telops);
  const nTelopLanes = Math.max(1, ...[...laneOf.values()].map((v) => v + 1), 1);

  let html = "";
  for (let li = 0; li < nTelopLanes; li++) {
    const clips = project.telops
      .filter((tp) => laneOf.get(tp.id) === li)
      .map((tp) => clipHtml(tp, duration, tp.id === selectedTelopId))
      .join("");
    html += `<div class="lane"><div class="label">テロップ ${li + 1}</div><div class="track">${clips}</div></div>`;
  }

  const imgHtml = project.images.map((im, i) => imageClipHtml(im, i, project.images, duration)).join("");
  html += `<div class="lane"><div class="label">画像</div><div class="track" id="imageTrack">${imgHtml}</div></div>`;

  const audioName = project.audio ? basename(project.audio.path) : "";
  const waveHtml =
    project.audio && waveformCache?.path === project.audio.path
      ? waveformCache.peaks
        ? renderWaveformSvg(waveformCache.peaks)
        : `<div class="empty-hint" style="padding:14px">波形の解析に失敗しました</div>`
      : `<div class="empty-hint" style="padding:14px">波形を解析中...</div>`;
  html += `<div class="lane audio"><div class="label">♪ ${escapeHtml(audioName)}</div><div class="track">${waveHtml}</div></div>`;

  lanesEl.innerHTML = html;

  document.querySelectorAll<HTMLElement>(".clip").forEach((clipEl) => {
    const id = Number(clipEl.dataset.id);
    bindClipDrag(clipEl, id, duration);
  });
  bindImageBoundaries(duration);
}

// ============ 初期化 ============

let currentAudioPath: string | null = null;

export function initTimeline(): void {
  wireRulerScrub();

  document.getElementById("lanes")?.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest(".clip, [data-boundary]")) return;
    selectTelop(null);
  });

  subscribeTime((t) => {
    renderPlayhead(t, getState().project.audio?.duration ?? 0);
  });

  subscribe(() => {
    const { project, currentTime } = getState();
    const duration = project.audio?.duration ?? 0;

    if (project.audio && project.audio.path !== currentAudioPath) {
      currentAudioPath = project.audio.path;
      waveformCache = null;
      void ensureWaveform(project.audio.path).then(renderLanes);
    } else if (!project.audio) {
      currentAudioPath = null;
      waveformCache = null;
    }

    renderRuler(duration);
    renderLanes();
    renderPlayhead(currentTime, duration);
  });

  const { project, currentTime } = getState();
  renderRuler(project.audio?.duration ?? 0);
  renderLanes();
  renderPlayhead(currentTime, project.audio?.duration ?? 0);
}
