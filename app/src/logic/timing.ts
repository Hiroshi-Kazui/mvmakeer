import type { ImageEntry, Telop } from "../types";
import { CROSSFADE_DURATION } from "../shared/params";

// クロスフェードの前後フェード窓([start-cf, start) と [end-cf, end))が
// 重ならないよう、最小表示時間はクロスフェード時間の2倍を確保する(preview/engine.ts参照)。
export const MIN_IMAGE_DURATION = CROSSFADE_DURATION * 2;
export const MIN_TELOP_VISIBLE_DURATION = 0.1;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ============ 画像の表示時間 ============

/** N枚の画像に totalDuration を均等割りする(端数は最後の1枚に寄せて合計を厳密一致させる)。 */
export function distributeEqually(totalDuration: number, count: number): number[] {
  if (count <= 0) return [];
  const base = totalDuration / count;
  const durations = new Array(count).fill(round3(base));
  const sum = durations.reduce((a, b) => a + b, 0);
  durations[durations.length - 1] = round3(durations[durations.length - 1] + (totalDuration - sum));
  return durations;
}

/** 全画像を均等割りし直す(manual フラグをすべて解除)。 */
export function resetToEqualDistribution(images: ImageEntry[], totalDuration: number): ImageEntry[] {
  const durations = distributeEqually(totalDuration, images.length);
  return images.map((im, i) => ({ ...im, duration: durations[i] ?? 0, manual: false }));
}

/**
 * index の画像の表示時間を newDuration に変更する。
 * 合計が totalDuration を維持するよう、manual でない(未固定の)画像で残時間を再配分する。
 * 全画像が manual の場合は再配分先がなく、合計が totalDuration からずれ得る(既知の制約)。
 */
export function setImageDuration(
  images: ImageEntry[],
  index: number,
  newDuration: number,
  totalDuration: number,
  minDuration = MIN_IMAGE_DURATION,
): ImageEntry[] {
  const n = images.length;
  if (index < 0 || index >= n) return images;

  const maxAllowed = Math.max(minDuration, totalDuration - minDuration * (n - 1));
  const clamped = Math.min(Math.max(newDuration, minDuration), maxAllowed);

  const updated: ImageEntry[] = images.map((im, i) =>
    i === index ? { ...im, duration: round3(clamped), manual: true } : { ...im },
  );

  const manualSum = updated.reduce((sum, im) => (im.manual ? sum + im.duration : sum), 0);
  const nonManualIdx = updated.reduce<number[]>((acc, im, i) => {
    if (!im.manual) acc.push(i);
    return acc;
  }, []);

  if (nonManualIdx.length === 0) {
    return updated;
  }

  const remaining = Math.max(0, totalDuration - manualSum);
  const nonManualCurrentSum = nonManualIdx.reduce((s, i) => s + updated[i].duration, 0);

  let assigned = 0;
  nonManualIdx.forEach((i, k) => {
    const isLast = k === nonManualIdx.length - 1;
    if (isLast) {
      updated[i] = { ...updated[i], duration: round3(remaining - assigned) };
      return;
    }
    const ratio = nonManualCurrentSum > 0 ? updated[i].duration / nonManualCurrentSum : 1 / nonManualIdx.length;
    const share = round3(ratio * remaining);
    updated[i] = { ...updated[i], duration: share };
    assigned += share;
  });

  return updated;
}

/**
 * index と index+1 の画像の境界をタイムライン上でドラッグ移動する。
 * 2枚の合計時間は変えず、境界の前後だけで配分し直す(他の画像には影響しない)。
 * setImageDuration とは異なり、変更を隣接2枚に限定する(境界ドラッグのUXに対応)。
 */
export function adjustImageBoundary(
  images: ImageEntry[],
  index: number,
  delta: number,
  minDuration = MIN_IMAGE_DURATION,
): ImageEntry[] {
  const left = images[index];
  const right = images[index + 1];
  if (!left || !right) return images;

  const pairTotal = left.duration + right.duration;
  const newLeftDuration = Math.min(Math.max(left.duration + delta, minDuration), pairTotal - minDuration);
  const newRightDuration = pairTotal - newLeftDuration;

  return images.map((im, i) => {
    if (i === index) return { ...im, duration: round3(newLeftDuration), manual: true };
    if (i === index + 1) return { ...im, duration: round3(newRightDuration), manual: true };
    return im;
  });
}

// ============ テロップの時刻 ============

/** テロップが完全に消える時刻(フェードアウト完了位置)。 */
export function telopVisibleEnd(t: Pick<Telop, "fadeOutStart" | "fadeOutDur">): number {
  return t.fadeOutStart + t.fadeOutDur;
}

/** timeIn <= fadeOutStart <= fadeOutStart+fadeOutDur を満たすよう補正する。 */
export function normalizeTelop(t: Telop): Telop {
  const fadeOutStart = Math.max(t.timeIn, t.fadeOutStart);
  const fadeOutDur = Math.max(0, t.fadeOutDur);
  const fadeInDur = Math.max(0, t.fadeInDur);
  return { ...t, fadeOutStart: round3(fadeOutStart), fadeOutDur: round3(fadeOutDur), fadeInDur: round3(fadeInDur) };
}

function sortByTimeIn(telops: Telop[]): Telop[] {
  return [...telops].sort((a, b) => a.timeIn - b.timeIn);
}

/**
 * 新規テロップを挿入する。同時表示は1つの制約(要件定義§4.4)により、
 * 挿入位置(newTelop.timeIn)を可視区間に含む既存テロップがあれば、
 * そのフェードアウトを新テロップの開始位置まで詰める。
 */
export function insertTelop(telops: Telop[], newTelop: Telop): Telop[] {
  const adjusted = telops.map((t) => {
    if (t.timeIn < newTelop.timeIn && telopVisibleEnd(t) > newTelop.timeIn) {
      const fadeOutStart = Math.min(t.fadeOutStart, newTelop.timeIn);
      const fadeOutDur = Math.min(t.fadeOutDur, Math.max(0, newTelop.timeIn - fadeOutStart));
      return normalizeTelop({ ...t, fadeOutStart, fadeOutDur });
    }
    return t;
  });
  return sortByTimeIn([...adjusted, newTelop]);
}

/**
 * id のテロップのフェードアウト開始位置を time に設定する(「O」操作/タイムラインの
 * O マーカードラッグ)。次のテロップの開始位置を超えないようクランプする。
 */
export function setFadeOutAt(telops: Telop[], id: number, time: number): Telop[] {
  const sorted = sortByTimeIn(telops);
  const idx = sorted.findIndex((t) => t.id === id);
  if (idx === -1) return telops;

  const t = sorted[idx];
  let fadeOutStart = Math.max(t.timeIn, time);
  let fadeOutDur = t.fadeOutDur;

  const next = sorted[idx + 1];
  if (next) {
    fadeOutStart = Math.min(fadeOutStart, next.timeIn);
    fadeOutDur = Math.min(fadeOutDur, Math.max(0, next.timeIn - fadeOutStart));
  }

  sorted[idx] = normalizeTelop({ ...t, fadeOutStart, fadeOutDur });
  return sorted;
}

/** タイムライン上でクリップ左端(開始位置)をドラッグする。フェードアウト開始より前に制限。 */
export function setTelopStart(telops: Telop[], id: number, newTimeIn: number): Telop[] {
  return telops.map((t) => {
    if (t.id !== id) return t;
    const timeIn = Math.max(0, Math.min(newTimeIn, t.fadeOutStart - MIN_TELOP_VISIBLE_DURATION));
    return normalizeTelop({ ...t, timeIn: round3(Math.max(0, timeIn)) });
  });
}

/** タイムライン上でクリップ右端(完全消滅位置)をドラッグする。fadeOutDur を調整する。 */
export function setTelopEnd(telops: Telop[], id: number, newEnd: number): Telop[] {
  return telops.map((t) => {
    if (t.id !== id) return t;
    const fadeOutDur = Math.max(MIN_TELOP_VISIBLE_DURATION, newEnd - t.fadeOutStart);
    return normalizeTelop({ ...t, fadeOutDur: round3(fadeOutDur) });
  });
}

/** クリップ本体をドラッグして移動する(timeIn/fadeOutStart を同じ量だけシフト)。 */
export function moveTelop(telops: Telop[], id: number, newTimeIn: number): Telop[] {
  return telops.map((t) => {
    if (t.id !== id) return t;
    const clampedTimeIn = Math.max(0, newTimeIn);
    const delta = clampedTimeIn - t.timeIn;
    return normalizeTelop({
      ...t,
      timeIn: round3(clampedTimeIn),
      fadeOutStart: round3(t.fadeOutStart + delta),
    });
  });
}
