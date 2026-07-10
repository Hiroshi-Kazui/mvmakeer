import { open, confirm } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { AudioEntry, ImageEntry } from "../types";
import { getState, setProject, subscribe } from "../state";
import { resetToEqualDistribution } from "../logic/timing";

const IMAGE_FILTERS = [{ name: "Images", extensions: ["jpg", "jpeg", "png"] }];
const AUDIO_FILTERS = [{ name: "Audio", extensions: ["mp3", "wav", "m4a"] }];

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function fmtSeconds(s: number): string {
  return `${s.toFixed(1)} 秒`;
}

/** 音声ファイルのメタデータ(長さ)を HTMLAudioElement で取得する。 */
function probeAudioDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(convertFileSrc(path));
    audio.addEventListener("loadedmetadata", () => resolve(audio.duration), { once: true });
    audio.addEventListener("error", () => reject(new Error(`音声の読み込みに失敗しました: ${path}`)), { once: true });
  });
}

function currentImages(): ImageEntry[] {
  return getState().project.images;
}

function currentAudio(): AudioEntry | null {
  return getState().project.audio;
}

function applyImages(images: ImageEntry[]): void {
  const project = getState().project;
  setProject({ ...project, images });
}

async function addImages(): Promise<void> {
  const selected = await open({ multiple: true, filters: IMAGE_FILTERS });
  if (!selected) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  if (paths.length === 0) return;

  const newEntries: ImageEntry[] = paths.map((path) => ({ path, duration: 0, manual: false }));
  const images = [...currentImages(), ...newEntries];
  const audio = currentAudio();
  applyImages(audio ? resetToEqualDistribution(images, audio.duration) : images);
}

async function removeImage(index: number): Promise<void> {
  const target = currentImages()[index];
  if (!target) return;
  const ok = await confirm(`「${basename(target.path)}」を削除しますか?`, { title: "削除の確認", kind: "warning" });
  if (!ok) return;

  const images = currentImages().filter((_, i) => i !== index);
  const audio = currentAudio();
  applyImages(audio && images.length > 0 ? resetToEqualDistribution(images, audio.duration) : images);
}

function reorderImages(from: number, to: number): void {
  if (from === to) return;
  const images = [...currentImages()];
  const [moved] = images.splice(from, 1);
  images.splice(to, 0, moved);
  applyImages(images);
}

async function addAudio(): Promise<void> {
  const selected = await open({ multiple: false, filters: AUDIO_FILTERS });
  if (!selected || Array.isArray(selected)) return;
  const duration = await probeAudioDuration(selected);
  const project = getState().project;
  const images = project.images.length > 0 ? resetToEqualDistribution(project.images, duration) : project.images;
  setProject({ ...project, audio: { path: selected, duration }, images });
}

async function removeAudio(): Promise<void> {
  const audio = currentAudio();
  if (!audio) return;
  const ok = await confirm(`「${basename(audio.path)}」を削除しますか?`, { title: "削除の確認", kind: "warning" });
  if (!ok) return;

  const project = getState().project;
  setProject({ ...project, audio: null });
}

function renderImageList(container: HTMLElement, emptyHint: HTMLElement): void {
  const images = currentImages();
  emptyHint.style.display = images.length === 0 ? "block" : "none";
  container.innerHTML = "";

  images.forEach((im, i) => {
    const item = document.createElement("div");
    item.className = "thumb-item";
    item.draggable = true;
    item.dataset.index = String(i);
    item.innerHTML = `
      <img class="thumb" src="${convertFileSrc(im.path)}" alt="">
      <div class="meta">
        <div class="name">${basename(im.path)}</div>
        <div class="sub">${fmtSeconds(im.duration)}${im.manual ? " (固定)" : ""}</div>
      </div>
      <button class="del" title="削除">✕</button>
      <div class="grip">⋮⋮</div>
    `;

    item.querySelector(".del")?.addEventListener("click", (e) => {
      e.stopPropagation();
      void removeImage(i);
    });

    item.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", String(i));
      e.dataTransfer!.effectAllowed = "move";
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      item.classList.add("dragover");
    });
    item.addEventListener("dragleave", () => item.classList.remove("dragover"));
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("dragover");
      const from = Number(e.dataTransfer?.getData("text/plain"));
      if (!Number.isNaN(from)) reorderImages(from, i);
    });

    container.appendChild(item);
  });
}

function renderAudioSlot(container: HTMLElement): void {
  const audio = currentAudio();
  if (!audio) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <div class="audio-item">
      <div class="icon">♪</div>
      <div class="meta" style="flex:1">
        <div class="name">${basename(audio.path)}</div>
        <div class="sub" style="font-size:10.5px;color:var(--text-2)">${fmtSeconds(audio.duration)}</div>
      </div>
      <button class="del" title="削除">✕</button>
    </div>
  `;
  container.querySelector(".del")?.addEventListener("click", () => void removeAudio());
}

export function initMaterialsPanel(): void {
  const imgList = document.getElementById("imgList")!;
  const imgEmptyHint = document.getElementById("imgEmptyHint")!;
  const audioSlot = document.getElementById("audioSlot")!;
  const btnAddImages = document.getElementById("btnAddImages")!;
  const btnAddAudio = document.getElementById("btnAddAudio")!;

  btnAddImages.addEventListener("click", () => void addImages());
  btnAddAudio.addEventListener("click", () => void addAudio());

  const render = () => {
    renderImageList(imgList, imgEmptyHint);
    renderAudioSlot(audioSlot);
  };

  subscribe(render);
  render();
}
