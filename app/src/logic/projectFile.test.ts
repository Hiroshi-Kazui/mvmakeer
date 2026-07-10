import { describe, it, expect } from "vitest";
import { serializeProject, parseProject, ProjectParseError, findMissingAssets, collectAssetPaths } from "./projectFile";
import { createEmptyProject, DEFAULT_TELOP_STYLE, type Project } from "../types";

function sampleProject(): Project {
  const p = createEmptyProject("My Music Video");
  p.audio = { path: "C:/media/song.mp3", duration: 225.0 };
  p.images = [
    { path: "C:/media/img_001.jpg", duration: 45.0, manual: false },
    { path: "C:/media/img_002.jpg", duration: 45.0, manual: true },
  ];
  p.telops = [
    {
      id: 1,
      text: "この景色が\n心をつなぐ",
      timeIn: 75.2,
      fadeInDur: 0.5,
      fadeOutStart: 79.8,
      fadeOutDur: 0.8,
      style: { ...DEFAULT_TELOP_STYLE },
    },
  ];
  return p;
}

describe("serializeProject / parseProject", () => {
  it("ラウンドトリップで内容が一致する", () => {
    const original = sampleProject();
    const json = serializeProject(original);
    const parsed = parseProject(json);
    expect(parsed).toEqual(original);
  });

  it("audio が null のプロジェクトも往復できる", () => {
    const original = createEmptyProject("Empty");
    const parsed = parseProject(serializeProject(original));
    expect(parsed).toEqual(original);
  });

  it("不正なJSONは ProjectParseError", () => {
    expect(() => parseProject("{not json")).toThrow(ProjectParseError);
  });

  it("version が異なる場合は ProjectParseError", () => {
    const bad = JSON.stringify({ ...sampleProject(), version: 2 });
    expect(() => parseProject(bad)).toThrow(ProjectParseError);
  });

  it("images が配列でない場合は ProjectParseError", () => {
    const bad = JSON.stringify({ ...sampleProject(), images: "not-array" });
    expect(() => parseProject(bad)).toThrow(ProjectParseError);
  });
});

describe("collectAssetPaths / findMissingAssets", () => {
  it("音声+画像のパスを収集する", () => {
    const paths = collectAssetPaths(sampleProject());
    expect(paths).toEqual(["C:/media/song.mp3", "C:/media/img_001.jpg", "C:/media/img_002.jpg"]);
  });

  it("存在しないパスのみを返す", async () => {
    const project = sampleProject();
    const missing = await findMissingAssets(project, async (p) => p !== "C:/media/img_002.jpg");
    expect(missing).toEqual(["C:/media/img_002.jpg"]);
  });

  it("すべて存在すれば空配列", async () => {
    const project = sampleProject();
    const missing = await findMissingAssets(project, async () => true);
    expect(missing).toEqual([]);
  });
});
