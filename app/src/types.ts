// .mvproj のドメインモデル。フィールドは要件定義.md §4.6 に準拠。

export type TelopPosition =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "middle-center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export interface TelopStyle {
  font: string;
  size: number;
  color: string; // "#rrggbb"
  position: TelopPosition;
}

export interface Telop {
  id: number;
  text: string;
  timeIn: number; // フェードイン開始位置(秒) = 挿入位置
  fadeInDur: number; // フェードイン時間(秒)
  fadeOutStart: number; // フェードアウト開始位置(秒)
  fadeOutDur: number; // フェードアウト時間(秒)
  style: TelopStyle;
}

export interface ImageEntry {
  path: string;
  duration: number; // 秒
  manual: boolean; // true = ユーザーが個別に秒数を指定済み(均等割り再配分の対象外)
}

export interface AudioEntry {
  path: string;
  duration: number; // 秒
}

export interface Project {
  version: 1;
  name: string;
  audio: AudioEntry | null;
  images: ImageEntry[];
  telops: Telop[];
}

export const DEFAULT_TELOP_STYLE: TelopStyle = {
  font: "游明朝",
  size: 72,
  color: "#ffffff",
  position: "middle-center",
};

export const DEFAULT_FADE_IN_DUR = 0.5;
export const DEFAULT_FADE_OUT_DUR = 0.8;

export function createEmptyProject(name = "New Project"): Project {
  return {
    version: 1,
    name,
    audio: null,
    images: [],
    telops: [],
  };
}
