import type { Project } from "../types";
import { CROSSFADE_DURATION, VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS } from "../shared/params";
import { escapeFfmpegFilterPath } from "./assBuilder";

export interface FfmpegExportPlan {
  args: string[];
  totalDuration: number;
}

/**
 * プロジェクトから ffmpeg の引数配列(argv、シェル文字列ではない)を組み立てる。
 * xfade のオフセット式は poc/RESULT.md で実測・確定した offset_k = start[k] - cf
 * (可変長画像の一般化)。preview/engine.ts の computeImageOpacities と同じ考え方。
 */
export function buildFfmpegArgs(
  project: Project,
  assFilePath: string,
  outputPath: string,
  cf: number = CROSSFADE_DURATION,
): FfmpegExportPlan {
  if (!project.audio) throw new Error("音声が設定されていません");
  const images = project.images;
  const n = images.length;
  if (n === 0) throw new Error("画像が設定されていません");

  const durations = images.map((im) => im.duration);
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  const args: string[] = [];
  images.forEach((im, i) => {
    args.push("-loop", "1", "-t", (durations[i] + cf).toFixed(3), "-i", im.path);
  });
  args.push("-i", project.audio.path);

  let scaleFilters = "";
  for (let i = 0; i < n; i++) {
    scaleFilters += `[${i}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1,fps=${VIDEO_FPS}[v${i}];`;
  }

  let lastLabel = "v0";
  let chain = "";
  if (n > 1) {
    let acc = durations[0];
    let prev = "v0";
    for (let i = 1; i < n; i++) {
      const offset = (acc - cf).toFixed(3);
      const out = i === n - 1 ? "vxfaded" : `vx${i}`;
      chain += `[${prev}][v${i}]xfade=transition=fade:duration=${cf}:offset=${offset}[${out}];`;
      prev = out;
      acc += durations[i];
    }
    lastLabel = prev;
  }

  const assPath = escapeFfmpegFilterPath(assFilePath);
  const filter = `${scaleFilters}${chain}[${lastLabel}]ass=filename='${assPath}'[vout]`;

  args.push(
    "-filter_complex", filter,
    "-map", "[vout]",
    "-map", `${n}:a`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-t", totalDuration.toFixed(3),
    "-progress", "pipe:1",
    "-y",
    outputPath,
  );

  return { args, totalDuration };
}
