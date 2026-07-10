import { save, open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import type { Project } from "../types";
import { parseProject, serializeProject, findMissingAssets } from "./projectFile";

const FILTERS = [{ name: "MV Maker Project", extensions: ["mvproj"] }];

/** 保存先を選択して .mvproj を書き出す。キャンセル時は null。 */
export async function saveProjectAs(project: Project): Promise<string | null> {
  const path = await save({ filters: FILTERS, defaultPath: `${project.name}.mvproj` });
  if (!path) return null;
  await writeTextFile(path, serializeProject(project));
  return path;
}

/** 既存パスに上書き保存する。 */
export async function saveProjectTo(project: Project, path: string): Promise<void> {
  await writeTextFile(path, serializeProject(project));
}

/** ファイル選択ダイアログで .mvproj を開く。キャンセル時は null。 */
export async function openProject(): Promise<{ path: string; project: Project } | null> {
  const path = await open({ filters: FILTERS, multiple: false });
  if (!path || Array.isArray(path)) return null;
  const text = await readTextFile(path);
  return { path, project: parseProject(text) };
}

/** プロジェクトが参照する素材のうち、実在しないパスを返す。 */
export async function checkMissingAssets(project: Project): Promise<string[]> {
  return findMissingAssets(project, (p) => exists(p));
}
