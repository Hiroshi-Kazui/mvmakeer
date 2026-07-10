import { createEmptyProject, type Project } from "./types";

export interface AppState {
  project: Project;
  projectPath: string | null; // 保存先パス。未保存なら null
  dirty: boolean;
  currentTime: number; // 秒
  playing: boolean;
  selectedTelopId: number | null;
}

type Listener = (state: AppState) => void;
type TimeListener = (currentTime: number) => void;

function createInitialState(): AppState {
  return {
    project: createEmptyProject(),
    projectPath: null,
    dirty: false,
    currentTime: 0,
    playing: false,
    selectedTelopId: null,
  };
}

let state: AppState = createInitialState();
const listeners = new Set<Listener>();
const timeListeners = new Set<TimeListener>();

export function getState(): AppState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * currentTime のみの変更を購読する(subscribe とは別枠)。
 * setPlaybackTime は再生中 60fps 級で呼ばれるため、subscribe の全体通知に
 * 混ぜると素材パネル等が無駄に再描画される。プレビューの描画ループはこちらを使う。
 */
export function subscribeTime(listener: TimeListener): () => void {
  timeListeners.add(listener);
  return () => timeListeners.delete(listener);
}

function apply(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

/** project を差し替える。呼び出し側からの変更は原則これを通し、dirty を立てる。 */
export function setProject(project: Project, markDirty = true): void {
  apply({ project, dirty: markDirty });
}

/** 高頻度に呼ばれる想定。subscribe ではなく subscribeTime にのみ通知する。 */
export function setPlaybackTime(currentTime: number): void {
  state = { ...state, currentTime };
  for (const listener of timeListeners) listener(currentTime);
}

export function setPlaying(playing: boolean): void {
  apply({ playing });
}

export function selectTelop(id: number | null): void {
  apply({ selectedTelopId: id });
}

export function markSaved(path: string): void {
  apply({ projectPath: path, dirty: false });
}

export function resetProject(): void {
  state = createInitialState();
  for (const listener of listeners) listener(state);
}
