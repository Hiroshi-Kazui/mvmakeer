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

export function getState(): AppState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function apply(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

/** project を差し替える。呼び出し側からの変更は原則これを通し、dirty を立てる。 */
export function setProject(project: Project, markDirty = true): void {
  apply({ project, dirty: markDirty });
}

export function setPlaybackTime(currentTime: number): void {
  apply({ currentTime });
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
