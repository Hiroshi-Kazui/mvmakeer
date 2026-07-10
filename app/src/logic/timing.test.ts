import { describe, it, expect } from "vitest";
import {
  distributeEqually,
  resetToEqualDistribution,
  setImageDuration,
  adjustImageBoundary,
  insertTelop,
  setFadeOutAt,
  setTelopStart,
  setTelopEnd,
  moveTelop,
  telopVisibleEnd,
  normalizeTelop,
} from "./timing";
import type { ImageEntry, Telop } from "../types";
import { DEFAULT_TELOP_STYLE } from "../types";

function makeImages(n: number): ImageEntry[] {
  return Array.from({ length: n }, (_, i) => ({ path: `img${i}.jpg`, duration: 0, manual: false }));
}

function makeTelop(overrides: Partial<Telop>): Telop {
  return {
    id: 1,
    text: "test",
    timeIn: 0,
    fadeInDur: 0.5,
    fadeOutStart: 4,
    fadeOutDur: 0.8,
    style: DEFAULT_TELOP_STYLE,
    ...overrides,
  };
}

describe("distributeEqually", () => {
  it("合計が totalDuration に厳密一致する", () => {
    const durations = distributeEqually(30.772167, 3);
    expect(durations.length).toBe(3);
    const sum = durations.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(30.772167, 3);
  });

  it("均等に近い値になる", () => {
    const durations = distributeEqually(30, 3);
    for (const d of durations) expect(d).toBeCloseTo(10, 3);
  });

  it("count=0 は空配列", () => {
    expect(distributeEqually(100, 0)).toEqual([]);
  });
});

describe("resetToEqualDistribution", () => {
  it("manual フラグをすべて解除し均等割りする", () => {
    const images = makeImages(3).map((im, i) => (i === 0 ? { ...im, duration: 20, manual: true } : im));
    const result = resetToEqualDistribution(images, 30);
    expect(result.every((im) => !im.manual)).toBe(true);
    const sum = result.reduce((a, b) => a + b.duration, 0);
    expect(sum).toBeCloseTo(30, 3);
  });
});

describe("setImageDuration", () => {
  it("変更した画像以外で残時間を再配分し、合計を維持する", () => {
    const images = resetToEqualDistribution(makeImages(3), 30); // [10,10,10]
    const result = setImageDuration(images, 0, 20, 30);
    expect(result[0].duration).toBeCloseTo(20, 3);
    expect(result[0].manual).toBe(true);
    const sum = result.reduce((a, b) => a + b.duration, 0);
    expect(sum).toBeCloseTo(30, 3);
    // 残り2枚で 10 秒を等分
    expect(result[1].duration).toBeCloseTo(5, 3);
    expect(result[2].duration).toBeCloseTo(5, 3);
  });

  it("既に manual な画像は再配分の対象外(値を保持する)", () => {
    let images = resetToEqualDistribution(makeImages(3), 30);
    images = setImageDuration(images, 0, 15, 30); // [15, 7.5, 7.5]
    const before0 = images[0].duration;
    images = setImageDuration(images, 1, 5, 30); // index1 を変更
    expect(images[0].duration).toBeCloseTo(before0, 3); // 変わらない
    expect(images[1].duration).toBeCloseTo(5, 3);
    const sum = images.reduce((a, b) => a + b.duration, 0);
    expect(sum).toBeCloseTo(30, 3);
  });

  it("最小秒数でクランプされる", () => {
    const images = resetToEqualDistribution(makeImages(3), 3); // [1,1,1]
    const result = setImageDuration(images, 0, 100, 3, 0.5);
    expect(result[0].duration).toBeLessThanOrEqual(3 - 0.5 * 2 + 1e-9);
  });
});

describe("normalizeTelop / telopVisibleEnd", () => {
  it("fadeOutStart が timeIn を下回らない", () => {
    const t = makeTelop({ timeIn: 5, fadeOutStart: 2, fadeOutDur: 1 });
    const n = normalizeTelop(t);
    expect(n.fadeOutStart).toBeGreaterThanOrEqual(n.timeIn);
  });

  it("telopVisibleEnd は fadeOutStart+fadeOutDur", () => {
    expect(telopVisibleEnd({ fadeOutStart: 10, fadeOutDur: 0.8 })).toBeCloseTo(10.8, 3);
  });
});

describe("insertTelop", () => {
  it("重ならない場合はそのまま追加される", () => {
    const t1 = makeTelop({ id: 1, timeIn: 0, fadeOutStart: 4, fadeOutDur: 0.8 });
    const t2 = makeTelop({ id: 2, timeIn: 10, fadeOutStart: 14, fadeOutDur: 0.8 });
    const result = insertTelop([t1], t2);
    expect(result).toHaveLength(2);
    expect(result[0].fadeOutStart).toBe(4);
  });

  it("新テロップの開始位置が既存テロップの可視区間に重なる場合、既存テロップのフェードアウトを詰める", () => {
    const prev = makeTelop({ id: 1, timeIn: 0, fadeOutStart: 8, fadeOutDur: 1 }); // 可視終了=9
    const next = makeTelop({ id: 2, timeIn: 5, fadeOutStart: 9, fadeOutDur: 1 });
    const result = insertTelop([prev], next);
    const adjustedPrev = result.find((t) => t.id === 1)!;
    // prev のフェードアウトは next の開始位置(5)以前に詰められる
    expect(telopVisibleEnd(adjustedPrev)).toBeLessThanOrEqual(5 + 1e-9);
    expect(adjustedPrev.fadeOutStart).toBeLessThanOrEqual(5);
  });

  it("結果は timeIn 昇順にソートされる", () => {
    const t1 = makeTelop({ id: 1, timeIn: 10, fadeOutStart: 14, fadeOutDur: 0.8 });
    const t2 = makeTelop({ id: 2, timeIn: 0, fadeOutStart: 4, fadeOutDur: 0.8 });
    const result = insertTelop([t1], t2);
    expect(result.map((t) => t.id)).toEqual([2, 1]);
  });
});

describe("setFadeOutAt", () => {
  it("指定位置にフェードアウト開始を設定する", () => {
    const t = makeTelop({ id: 1, timeIn: 0, fadeOutStart: 4, fadeOutDur: 0.8 });
    const result = setFadeOutAt([t], 1, 6);
    expect(result[0].fadeOutStart).toBeCloseTo(6, 3);
  });

  it("timeIn より前には設定できない", () => {
    const t = makeTelop({ id: 1, timeIn: 5, fadeOutStart: 9, fadeOutDur: 0.8 });
    const result = setFadeOutAt([t], 1, 2);
    expect(result[0].fadeOutStart).toBeCloseTo(5, 3);
  });

  it("次のテロップの開始位置を超えない", () => {
    const t1 = makeTelop({ id: 1, timeIn: 0, fadeOutStart: 4, fadeOutDur: 0.8 });
    const t2 = makeTelop({ id: 2, timeIn: 6, fadeOutStart: 10, fadeOutDur: 0.8 });
    const result = setFadeOutAt([t1, t2], 1, 8); // 8 は t2.timeIn=6 を超えている
    const adjusted = result.find((t) => t.id === 1)!;
    expect(telopVisibleEnd(adjusted)).toBeLessThanOrEqual(6 + 1e-9);
  });

  it("存在しない id はそのまま返す", () => {
    const t = makeTelop({ id: 1 });
    const result = setFadeOutAt([t], 999, 5);
    expect(result).toEqual([t]);
  });
});

describe("adjustImageBoundary", () => {
  it("隣接2枚の合計時間を変えずに境界を移動する", () => {
    const images = resetToEqualDistribution(makeImages(3), 30); // [10,10,10]
    const result = adjustImageBoundary(images, 0, 2); // 境界を2秒右へ
    expect(result[0].duration).toBeCloseTo(12, 3);
    expect(result[1].duration).toBeCloseTo(8, 3);
    expect(result[2].duration).toBeCloseTo(10, 3); // 影響なし
    const sum = result.reduce((a, b) => a + b.duration, 0);
    expect(sum).toBeCloseTo(30, 3);
  });

  it("両方を manual にする", () => {
    const images = resetToEqualDistribution(makeImages(2), 20);
    const result = adjustImageBoundary(images, 0, 1);
    expect(result[0].manual).toBe(true);
    expect(result[1].manual).toBe(true);
  });

  it("最小秒数でクランプされる", () => {
    const images = resetToEqualDistribution(makeImages(2), 5); // [2.5, 2.5]
    const result = adjustImageBoundary(images, 0, 100, 0.5);
    expect(result[0].duration).toBeLessThanOrEqual(5 - 0.5 + 1e-9);
    expect(result[1].duration).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });

  it("存在しない index はそのまま返す", () => {
    const images = resetToEqualDistribution(makeImages(2), 20);
    expect(adjustImageBoundary(images, 5, 1)).toEqual(images);
  });
});

describe("setTelopStart", () => {
  it("開始位置を変更する", () => {
    const t = makeTelop({ id: 1, timeIn: 2, fadeOutStart: 8, fadeOutDur: 0.8 });
    const result = setTelopStart([t], 1, 4);
    expect(result[0].timeIn).toBeCloseTo(4, 3);
  });

  it("フェードアウト開始を超えて右に動かせない", () => {
    const t = makeTelop({ id: 1, timeIn: 2, fadeOutStart: 8, fadeOutDur: 0.8 });
    const result = setTelopStart([t], 1, 10);
    expect(result[0].timeIn).toBeLessThan(8);
  });

  it("0未満にはならない", () => {
    const t = makeTelop({ id: 1, timeIn: 2, fadeOutStart: 8, fadeOutDur: 0.8 });
    const result = setTelopStart([t], 1, -5);
    expect(result[0].timeIn).toBe(0);
  });
});

describe("setTelopEnd", () => {
  it("fadeOutDur を調整して終了位置を変更する", () => {
    const t = makeTelop({ id: 1, timeIn: 0, fadeOutStart: 4, fadeOutDur: 0.8 });
    const result = setTelopEnd([t], 1, 6);
    expect(telopVisibleEnd(result[0])).toBeCloseTo(6, 3);
  });

  it("フェードアウト開始より前には縮められない", () => {
    const t = makeTelop({ id: 1, timeIn: 0, fadeOutStart: 4, fadeOutDur: 0.8 });
    const result = setTelopEnd([t], 1, 2);
    expect(result[0].fadeOutDur).toBeGreaterThan(0);
    expect(telopVisibleEnd(result[0])).toBeGreaterThan(4);
  });
});

describe("moveTelop", () => {
  it("timeIn と fadeOutStart を同じ量だけシフトする", () => {
    const t = makeTelop({ id: 1, timeIn: 2, fadeOutStart: 6, fadeOutDur: 0.8 });
    const result = moveTelop([t], 1, 5); // +3
    expect(result[0].timeIn).toBeCloseTo(5, 3);
    expect(result[0].fadeOutStart).toBeCloseTo(9, 3);
    expect(result[0].fadeOutDur).toBeCloseTo(0.8, 3);
  });

  it("0未満にはならない", () => {
    const t = makeTelop({ id: 1, timeIn: 2, fadeOutStart: 6, fadeOutDur: 0.8 });
    const result = moveTelop([t], 1, -10);
    expect(result[0].timeIn).toBe(0);
  });
});
