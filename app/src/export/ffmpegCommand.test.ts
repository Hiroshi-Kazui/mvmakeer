import { describe, it, expect } from "vitest";
import { buildFfmpegArgs } from "./ffmpegCommand";
import { createEmptyProject, type Project } from "../types";

function sampleProject(imageDurations: number[]): Project {
  const p = createEmptyProject("Test");
  p.audio = { path: "C:/media/song.mp3", duration: imageDurations.reduce((a, b) => a + b, 0) };
  p.images = imageDurations.map((d, i) => ({ path: `C:/media/img${i}.jpg`, duration: d, manual: false }));
  return p;
}

describe("buildFfmpegArgs", () => {
  it("画像の数だけ -i が入る(+音声1つ)", () => {
    const project = sampleProject([10.257389, 10.257389, 10.257389]);
    const { args } = buildFfmpegArgs(project, "C:/tmp/telops.ass", "C:/out/output.mp4");
    const inputCount = args.filter((a) => a === "-i").length;
    expect(inputCount).toBe(4); // 画像3 + 音声1
  });

  it("poc/RESULT.md のオフセット式(offset_k = k*d - cf)と一致する", () => {
    const d = 10.257389;
    const project = sampleProject([d, d, d]);
    const { args } = buildFfmpegArgs(project, "C:/tmp/telops.ass", "C:/out/output.mp4", 1.0);
    const filterIdx = args.indexOf("-filter_complex");
    const filter = args[filterIdx + 1];
    expect(filter).toContain(`offset=${(d - 1.0).toFixed(3)}`);
    expect(filter).toContain(`offset=${(2 * d - 1.0).toFixed(3)}`);
  });

  it("totalDuration は画像の合計時間", () => {
    const project = sampleProject([5, 15, 8]);
    const { totalDuration } = buildFfmpegArgs(project, "C:/tmp/telops.ass", "C:/out/output.mp4");
    expect(totalDuration).toBeCloseTo(28, 3);
  });

  it("画像1枚のみでも xfade を使わず動作する", () => {
    const project = sampleProject([30]);
    const { args } = buildFfmpegArgs(project, "C:/tmp/telops.ass", "C:/out/output.mp4");
    const filterIdx = args.indexOf("-filter_complex");
    expect(args[filterIdx + 1]).not.toContain("xfade");
  });

  it("音声がない場合はエラー", () => {
    const project = createEmptyProject("Empty");
    project.images = [{ path: "img.jpg", duration: 5, manual: false }];
    expect(() => buildFfmpegArgs(project, "a.ass", "out.mp4")).toThrow();
  });

  it("画像がない場合はエラー", () => {
    const project = createEmptyProject("Empty");
    project.audio = { path: "a.mp3", duration: 5 };
    expect(() => buildFfmpegArgs(project, "a.ass", "out.mp4")).toThrow();
  });

  it("出力パスとass参照が含まれる", () => {
    const project = sampleProject([10, 10]);
    const { args } = buildFfmpegArgs(project, "C:\\tmp\\telops.ass", "C:/out/output.mp4");
    expect(args[args.length - 1]).toBe("C:/out/output.mp4");
    const filterIdx = args.indexOf("-filter_complex");
    expect(args[filterIdx + 1]).toContain("ass=filename='C\\:/tmp/telops.ass'");
  });
});
