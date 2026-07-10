import type { Telop, TelopPosition } from "../types";
import { telopVisibleEnd } from "../logic/timing";
import { VIDEO_WIDTH, VIDEO_HEIGHT } from "../shared/params";

// poc/RESULT.md で確定した ASS 方式: Style1つ = テロップ1つ、\fad でフェード、
// Alignment で9分割位置を表現(縁取りなし・影固定は要件定義§4.4)。

const ALIGNMENT: Record<TelopPosition, number> = {
  "bottom-left": 1, "bottom-center": 2, "bottom-right": 3,
  "middle-left": 4, "middle-center": 5, "middle-right": 6,
  "top-left": 7, "top-center": 8, "top-right": 9,
};

/** "#rrggbb" を ASS の &HAABBGGRR 形式(アルファ00=不透明)に変換する。 */
export function toAssColor(hexColor: string): string {
  const hex = hexColor.replace("#", "").padStart(6, "0");
  const r = hex.slice(0, 2);
  const g = hex.slice(2, 4);
  const b = hex.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/** 秒数を ASS の時刻形式 H:MM:SS.CC(センチ秒)に変換する。 */
export function toAssTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.round((clamped % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}

function styleLine(t: Telop): string {
  const alignment = ALIGNMENT[t.style.position];
  const color = toAssColor(t.style.color);
  // Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,
  //         Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,
  //         BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
  return `Style: t${t.id},${t.style.font},${t.style.size},${color},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,2,${alignment},10,10,10,1`;
}

function dialogueLine(t: Telop): string {
  const start = toAssTime(t.timeIn);
  const end = toAssTime(telopVisibleEnd(t));
  const fadeInMs = Math.max(0, Math.round(t.fadeInDur * 1000));
  const fadeOutMs = Math.max(0, Math.round(t.fadeOutDur * 1000));
  const text = escapeAssText(t.text);
  return `Dialogue: 0,${start},${end},t${t.id},,0,0,0,,{\\fad(${fadeInMs},${fadeOutMs})}${text}`;
}

/** テロップ配列から .ass 字幕ファイルの内容を生成する。 */
export function buildAssContent(telops: Telop[]): string {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${VIDEO_WIDTH}`,
    `PlayResY: ${VIDEO_HEIGHT}`,
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  ].join("\n");

  const styles = telops.map(styleLine).join("\n");

  const eventsHeader = [
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const events = telops.map(dialogueLine).join("\n");

  return `${header}\n${styles}\n${eventsHeader}\n${events}\n`;
}

/**
 * ffmpeg の filter 文字列内でファイルパスを安全に参照できる形式に変換する。
 * (poc で実測確認: バックスラッシュ→スラッシュ、コロンを \: にエスケープ)
 */
export function escapeFfmpegFilterPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/:/g, "\\:");
}
