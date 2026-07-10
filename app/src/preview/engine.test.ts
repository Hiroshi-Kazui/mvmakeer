import { describe, it, expect } from "vitest";
import { computeImageOpacities, computeTelopOpacity, pickVisibleTelop } from "./engine";
import type { ImageEntry, Telop } from "../types";
import { DEFAULT_TELOP_STYLE } from "../types";

function makeImages(durations: number[]): ImageEntry[] {
  return durations.map((d, i) => ({ path: `img${i}.jpg`, duration: d, manual: false }));
}

describe("computeImageOpacities", () => {
  it("poc/RESULT.md で確定した3枚等分ケース(d=10.257389s, cf=1.0)と一致する", () => {
    const d = 10.257389;
    const images = makeImages([d, d, d]);
    // 各画像の中間点では完全に不透明
    expect(computeImageOpacities(images, 5, 1.0)[0]).toBeCloseTo(1, 5);
    expect(computeImageOpacities(images, 15, 1.0)[1]).toBeCloseTo(1, 5);
    expect(computeImageOpacities(images, 25, 1.0)[2]).toBeCloseTo(1, 5);
  });

  it("境界(1枚目→2枚目)でクロスフェード中は合計がほぼ1になる", () => {
    const images = makeImages([10, 10, 10]);
    // 1枚目の可視終了は10、クロスフェード窓は[9,10)
    const t = 9.5;
    const ops = computeImageOpacities(images, t, 1.0);
    expect(ops[0] + ops[1]).toBeCloseTo(1, 5);
    expect(ops[0]).toBeCloseTo(0.5, 5);
    expect(ops[1]).toBeCloseTo(0.5, 5);
  });

  it("最初の画像は先頭でフェードインしない(常に不透明)", () => {
    const images = makeImages([10, 10]);
    expect(computeImageOpacities(images, 0, 1.0)[0]).toBeCloseTo(1, 5);
  });

  it("最後の画像は末尾でフェードアウトしない", () => {
    const images = makeImages([10, 10]);
    expect(computeImageOpacities(images, 20, 1.0)[1]).toBeCloseTo(1, 5);
  });

  it("画像0枚は空配列", () => {
    expect(computeImageOpacities([], 0)).toEqual([]);
  });

  it("表示時間が異なる画像でも合計時間を超えない", () => {
    const images = makeImages([5, 15, 8]);
    const total = 5 + 15 + 8;
    const ops = computeImageOpacities(images, total - 0.01, 1.0);
    expect(ops[2]).toBeGreaterThan(0);
  });
});

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

describe("computeTelopOpacity", () => {
  it("timeIn 前は 0", () => {
    const t = makeTelop({ timeIn: 5 });
    expect(computeTelopOpacity(t, 4)).toBe(0);
  });

  it("フェードイン中は線形に増加する", () => {
    const t = makeTelop({ timeIn: 0, fadeInDur: 0.5 });
    expect(computeTelopOpacity(t, 0.25)).toBeCloseTo(0.5, 5);
  });

  it("フェードイン後・フェードアウト前は 1", () => {
    const t = makeTelop({ timeIn: 0, fadeInDur: 0.5, fadeOutStart: 4, fadeOutDur: 0.8 });
    expect(computeTelopOpacity(t, 2)).toBe(1);
  });

  it("フェードアウト中は線形に減少する", () => {
    const t = makeTelop({ timeIn: 0, fadeInDur: 0.5, fadeOutStart: 4, fadeOutDur: 0.8 });
    expect(computeTelopOpacity(t, 4.4)).toBeCloseTo(0.5, 5);
  });

  it("完全消滅後は 0", () => {
    const t = makeTelop({ timeIn: 0, fadeInDur: 0.5, fadeOutStart: 4, fadeOutDur: 0.8 });
    expect(computeTelopOpacity(t, 5)).toBe(0);
  });
});

describe("pickVisibleTelop", () => {
  it("表示中のテロップがなければ null", () => {
    const t = makeTelop({ timeIn: 10, fadeOutStart: 14, fadeOutDur: 0.8 });
    expect(pickVisibleTelop([t], 0)).toBeNull();
  });

  it("重なりがあれば timeIn が最も新しいものを選ぶ", () => {
    const t1 = makeTelop({ id: 1, timeIn: 0, fadeOutStart: 10, fadeOutDur: 0.8 });
    const t2 = makeTelop({ id: 2, timeIn: 5, fadeOutStart: 10, fadeOutDur: 0.8 });
    const picked = pickVisibleTelop([t1, t2], 6);
    expect(picked?.id).toBe(2);
  });
});
