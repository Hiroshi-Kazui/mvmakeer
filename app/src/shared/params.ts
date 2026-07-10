// プレビュー(preview/engine.ts)と書き出し(export/ffmpegCommand.ts, Phase 7)で
// 共有するパラメータ。両者が独立に定義すると見た目・タイミングがずれるため、
// ここに一元化する(要件定義§4.2/§4.7)。

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;

/** クロスフェード時間(秒)。固定(要件定義§4.2)。 */
export const CROSSFADE_DURATION = 1.0;
