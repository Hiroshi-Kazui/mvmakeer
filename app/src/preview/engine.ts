import { convertFileSrc } from "@tauri-apps/api/core";
import type { ImageEntry, Telop, TelopPosition } from "../types";
import { getState, setPlaybackTime, setPlaying, subscribe } from "../state";
import { CROSSFADE_DURATION, VIDEO_WIDTH } from "../shared/params";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * 画像ごとの不透明度を計算する。画像は隙間なく連結された位置(累積時間)に配置され、
 * 直前・直後の画像との境界の前後 CROSSFADE_DURATION 秒でクロスフェードする。
 * 式は poc/RESULT.md で実測・確定した offset_k = k*d - cf の一般化(可変長対応)。
 */
export function computeImageOpacities(images: ImageEntry[], t: number, cf = CROSSFADE_DURATION): number[] {
  const n = images.length;
  if (n === 0) return [];

  const starts: number[] = [];
  let acc = 0;
  for (const im of images) {
    starts.push(acc);
    acc += im.duration;
  }
  const ends = starts.map((s, i) => s + images[i].duration);

  return images.map((_, i) => {
    const hasFadeIn = i > 0;
    const hasFadeOut = i < n - 1;
    const visStart = starts[i];
    const visEnd = ends[i];
    const windowStart = visStart - (hasFadeIn ? cf : 0);
    if (t < windowStart || t > visEnd) return 0;

    if (hasFadeIn && t < visStart) {
      return clamp01((t - windowStart) / cf);
    }
    if (hasFadeOut && t >= visEnd - cf) {
      return clamp01((visEnd - t) / cf);
    }
    return 1;
  });
}

/** テロップの不透明度(フェードイン/アウト込み)。 */
export function computeTelopOpacity(t: Telop, time: number): number {
  const visEnd = t.fadeOutStart + t.fadeOutDur;
  if (time < t.timeIn || time > visEnd) return 0;
  if (time < t.timeIn + t.fadeInDur) {
    return clamp01((time - t.timeIn) / Math.max(t.fadeInDur, 1e-6));
  }
  if (time > t.fadeOutStart) {
    return clamp01(1 - (time - t.fadeOutStart) / Math.max(t.fadeOutDur, 1e-6));
  }
  return 1;
}

/** 同時刻で表示すべきテロップを1つ選ぶ(要件定義§4.4: 同時表示は1つ)。 */
export function pickVisibleTelop(telops: Telop[], time: number): Telop | null {
  let best: Telop | null = null;
  for (const tp of telops) {
    if (computeTelopOpacity(tp, time) > 0 && (!best || tp.timeIn > best.timeIn)) best = tp;
  }
  return best;
}

const POSITION_STYLE: Record<TelopPosition, { justify: string; align: string }> = {
  "top-left": { justify: "flex-start", align: "flex-start" },
  "top-center": { justify: "center", align: "flex-start" },
  "top-right": { justify: "flex-end", align: "flex-start" },
  "middle-left": { justify: "flex-start", align: "center" },
  "middle-center": { justify: "center", align: "center" },
  "middle-right": { justify: "flex-end", align: "center" },
  "bottom-left": { justify: "flex-start", align: "flex-end" },
  "bottom-center": { justify: "center", align: "flex-end" },
  "bottom-right": { justify: "flex-end", align: "flex-end" },
};

function fmtTimecode(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

let audioEl: HTMLAudioElement | null = null;
let loadedAudioPath: string | null = null;
let lastImagePaths: string[] = [];
let slideEls: HTMLDivElement[] = [];
let rafId: number | null = null;
let seeking = false;

function ensureAudioElement(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.addEventListener("ended", () => {
      setPlaying(false);
      stopLoop();
    });
  }
  return audioEl;
}

function syncAudioSource(): void {
  const { project } = getState();
  const el = ensureAudioElement();
  const path = project.audio?.path ?? null;
  if (path !== loadedAudioPath) {
    loadedAudioPath = path;
    el.src = path ? convertFileSrc(path) : "";
    if (path) el.load();
  }
}

function syncSlides(images: ImageEntry[]): void {
  const paths = images.map((im) => im.path);
  const unchanged = paths.length === lastImagePaths.length && paths.every((p, i) => p === lastImagePaths[i]);
  if (unchanged) return;
  lastImagePaths = paths;

  const preview = document.getElementById("preview");
  if (!preview) return;
  for (const el of slideEls) el.remove();
  slideEls = images.map((im) => {
    const div = document.createElement("div");
    div.className = "slide";
    div.style.backgroundImage = `url("${convertFileSrc(im.path)}")`;
    preview.insertBefore(div, preview.firstChild);
    return div;
  });
}

function renderImages(t: number, images: ImageEntry[]): void {
  syncSlides(images);
  const opacities = computeImageOpacities(images, t);
  slideEls.forEach((el, i) => {
    el.style.opacity = String(opacities[i] ?? 0);
  });
}

function renderTelop(t: number, telops: Telop[]): void {
  const layer = document.querySelector<HTMLElement>(".telop-layer");
  const textEl = document.getElementById("telopText");
  const badge = document.getElementById("activeBadge");
  if (!layer || !textEl) return;

  const best = pickVisibleTelop(telops, t);
  const { selectedTelopId } = getState();
  badge?.classList.toggle("on", best !== null && best.id === selectedTelopId);

  if (!best) {
    textEl.style.opacity = "0";
    return;
  }

  const preview = document.getElementById("preview");
  const scale = preview ? preview.clientWidth / VIDEO_WIDTH : 1;

  textEl.textContent = best.text;
  textEl.style.opacity = String(computeTelopOpacity(best, t));
  textEl.style.fontFamily = `"${best.style.font}", "Yu Mincho", "Hiragino Mincho ProN", serif`;
  textEl.style.fontSize = `${Math.max(8, best.style.size * scale)}px`;
  textEl.style.color = best.style.color;

  const pos = POSITION_STYLE[best.style.position];
  layer.style.justifyContent = pos.justify;
  layer.style.alignItems = pos.align;
}

function renderTransport(t: number): void {
  const { project, playing } = getState();
  const duration = project.audio?.duration ?? 0;

  const tcCur = document.getElementById("tcCur");
  if (tcCur) tcCur.textContent = fmtTimecode(t);

  const pct = duration > 0 ? (t / duration) * 100 : 0;
  const seekFill = document.getElementById("seekFill");
  const seekKnob = document.getElementById("seekKnob");
  if (seekFill) seekFill.style.width = `${pct}%`;
  if (seekKnob) seekKnob.style.left = `${pct}%`;

  const playBtn = document.getElementById("btnPlay");
  if (playBtn) playBtn.textContent = playing ? "❚❚" : "▶";
}

function renderFrame(t: number): void {
  const { project } = getState();
  renderImages(t, project.images);
  renderTelop(t, project.telops);
  renderTransport(t);
}

function loopStep(): void {
  const el = ensureAudioElement();
  if (!seeking) {
    setPlaybackTime(el.currentTime);
    renderFrame(el.currentTime);
  }
  if (!el.paused) {
    rafId = requestAnimationFrame(loopStep);
  } else {
    rafId = null;
  }
}

function startLoop(): void {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(loopStep);
}

function stopLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function play(): void {
  const { project } = getState();
  if (!project.audio) return;
  syncAudioSource();
  const el = ensureAudioElement();
  void el.play();
  setPlaying(true);
  startLoop();
}

export function pause(): void {
  const el = ensureAudioElement();
  el.pause();
  setPlaying(false);
  stopLoop();
}

export function togglePlay(): void {
  getState().playing ? pause() : play();
}

export function seekTo(t: number): void {
  const { project } = getState();
  const duration = project.audio?.duration ?? 0;
  const clamped = Math.min(Math.max(t, 0), duration);
  const el = ensureAudioElement();
  seeking = true;
  el.currentTime = clamped;
  seeking = false;
  setPlaybackTime(clamped);
  renderFrame(clamped);
}

export function seekBy(deltaSeconds: number): void {
  seekTo(getState().currentTime + deltaSeconds);
}

function wireTransportControls(): void {
  document.getElementById("btnPlay")?.addEventListener("click", togglePlay);
  document.getElementById("btnPrev")?.addEventListener("click", () => seekTo(0));
  document.getElementById("btnNext")?.addEventListener("click", () => {
    pause();
    seekTo(getState().project.audio?.duration ?? 0);
  });

  const seek = document.getElementById("seek");
  if (seek) {
    const seekFromEvent = (e: MouseEvent) => {
      const rect = seek.getBoundingClientRect();
      const ratio = clamp01((e.clientX - rect.left) / rect.width);
      seekTo(ratio * (getState().project.audio?.duration ?? 0));
    };
    seek.addEventListener("mousedown", (e) => {
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

  const volSlider = document.getElementById("volSlider") as HTMLInputElement | null;
  volSlider?.addEventListener("input", () => {
    ensureAudioElement().volume = clamp01(Number(volSlider.value) / 100);
  });

  document.addEventListener("keydown", (e) => {
    if (!getState().project.audio) return;
    const target = e.target as HTMLElement;
    if (target.matches("textarea, input, select")) return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft") {
      seekBy(-1);
    } else if (e.key === "ArrowRight") {
      seekBy(1);
    }
  });
}

/**
 * ドラッグ操作中など、state へのコミット(setProject)前に一時的な配列で
 * プレビューだけ即時更新したい場合に使う。commit しない軽量パス。
 */
export function previewWithOverrides(overrides: { images?: ImageEntry[]; telops?: Telop[] }): void {
  const { project, currentTime } = getState();
  renderImages(currentTime, overrides.images ?? project.images);
  renderTelop(currentTime, overrides.telops ?? project.telops);
}

export function initPreviewEngine(): void {
  wireTransportControls();
  subscribe(() => {
    syncAudioSource();
    renderFrame(getState().currentTime);
  });
  renderFrame(0);
}
