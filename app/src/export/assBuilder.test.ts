import { describe, it, expect } from "vitest";
import { buildAssContent, toAssColor, toAssTime, escapeFfmpegFilterPath } from "./assBuilder";
import { DEFAULT_TELOP_STYLE, type Telop } from "../types";

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

describe("toAssColor", () => {
  it("白は &H00FFFFFF になる", () => {
    expect(toAssColor("#ffffff")).toBe("&H00FFFFFF");
  });
  it("RGB順がBGR順に変換される", () => {
    expect(toAssColor("#ff9db5")).toBe("&H00B59DFF");
  });
});

describe("toAssTime", () => {
  it("H:MM:SS.CC 形式になる", () => {
    expect(toAssTime(75.2)).toBe("0:01:15.20");
  });
  it("0秒は 0:00:00.00", () => {
    expect(toAssTime(0)).toBe("0:00:00.00");
  });
  it("1時間超も扱える", () => {
    expect(toAssTime(3661.5)).toBe("1:01:01.50");
  });
});

describe("buildAssContent", () => {
  it("Style数とDialogue数がテロップ数と一致する", () => {
    const telops = [
      makeTelop({ id: 1, text: "この景色が\n心をつなぐ", timeIn: 75.2, fadeOutStart: 79.8, fadeOutDur: 0.8 }),
      makeTelop({ id: 2, text: "君の声が", timeIn: 82, fadeOutStart: 86, fadeOutDur: 0.8 }),
    ];
    const content = buildAssContent(telops);
    const styleCount = (content.match(/^Style: /gm) ?? []).length;
    const dialogueCount = (content.match(/^Dialogue: /gm) ?? []).length;
    expect(styleCount).toBe(2);
    expect(dialogueCount).toBe(2);
  });

  it("改行が \\N に変換される", () => {
    const content = buildAssContent([makeTelop({ text: "この景色が\n心をつなぐ" })]);
    expect(content).toContain("この景色が\\N心をつなぐ");
  });

  it("fadeInDur/fadeOutDur がミリ秒の \\fad タグになる", () => {
    const content = buildAssContent([makeTelop({ fadeInDur: 0.5, fadeOutStart: 4, fadeOutDur: 0.8 })]);
    expect(content).toContain("\\fad(500,800)");
  });

  it("テロップ0件でもエラーにならない", () => {
    expect(() => buildAssContent([])).not.toThrow();
  });

  it("波括弧を含むテキストをエスケープする", () => {
    const content = buildAssContent([makeTelop({ text: "{test}" })]);
    expect(content).toContain("\\{test\\}");
  });
});

describe("escapeFfmpegFilterPath", () => {
  it("バックスラッシュをスラッシュに変換し、コロンをエスケープする", () => {
    expect(escapeFfmpegFilterPath("C:\\Users\\test\\file.ass")).toBe("C\\:/Users/test/file.ass");
  });
});
