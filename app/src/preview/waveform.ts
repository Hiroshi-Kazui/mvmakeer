import { convertFileSrc } from "@tauri-apps/api/core";

const TARGET_PEAKS = 800;

/**
 * 音声ファイルをデコードし、波形描画用のピーク配列(0..1に正規化)を返す。
 * Web Audio API の decodeAudioData を使用(mp3/wav/一部m4aで動作)。
 * デコードに失敗した場合は null を返す(呼び出し側でプレースホルダ表示)。
 */
export async function extractPeaks(path: string, targetPeaks = TARGET_PEAKS): Promise<number[] | null> {
  try {
    const res = await fetch(convertFileSrc(path));
    const arrayBuffer = await res.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const peaks = computePeaks(audioBuffer, targetPeaks);
    void ctx.close();
    return peaks;
  } catch {
    return null;
  }
}

function computePeaks(audioBuffer: AudioBuffer, targetPeaks: number): number[] {
  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const samplesPerPeak = Math.max(1, Math.floor(length / targetPeaks));
  const peaks: number[] = [];

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) channelData.push(audioBuffer.getChannelData(c));

  for (let i = 0; i < targetPeaks; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(length, start + samplesPerPeak);
    let max = 0;
    for (let s = start; s < end; s++) {
      for (const data of channelData) {
        const v = Math.abs(data[s]);
        if (v > max) max = v;
      }
    }
    peaks.push(max);
  }

  const peakMax = Math.max(1e-6, ...peaks);
  return peaks.map((p) => Math.min(1, p / peakMax));
}

/** peaks を SVG のバー波形として canvas 相当のコンテナに描画する(DOM文字列を返す)。 */
export function renderWaveformSvg(peaks: number[]): string {
  const bars = peaks
    .map((p, i) => {
      const h = Math.max(2, p * 100);
      const x = (i / peaks.length) * 100;
      const w = 100 / peaks.length;
      return `<rect x="${x.toFixed(3)}%" y="${((100 - h) / 2).toFixed(2)}%" width="${(w * 0.7).toFixed(3)}%" height="${h.toFixed(2)}%" rx="0.4" fill="#6a5fd4"/>`;
    })
    .join("");
  return `<svg class="wave" width="100%" height="100%" preserveAspectRatio="none">${bars}</svg>`;
}
