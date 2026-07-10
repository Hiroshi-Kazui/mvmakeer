import type { Project } from "../types";

export class ProjectParseError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Project を .mvproj のJSON文字列にシリアライズする。 */
export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/**
 * .mvproj のJSON文字列をパースし、最低限のスキーマ検証を行う。
 * 不正な場合は ProjectParseError を投げる(呼び出し境界での検証)。
 */
export function parseProject(json: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new ProjectParseError(`JSON parse failed: ${(e as Error).message}`);
  }

  if (!isRecord(data)) throw new ProjectParseError("root is not an object");
  if (data.version !== 1) throw new ProjectParseError(`unsupported version: ${String(data.version)}`);
  if (typeof data.name !== "string") throw new ProjectParseError("name must be a string");
  if (!Array.isArray(data.images)) throw new ProjectParseError("images must be an array");
  if (!Array.isArray(data.telops)) throw new ProjectParseError("telops must be an array");
  if (data.audio !== null && !isRecord(data.audio)) throw new ProjectParseError("audio must be an object or null");

  return data as unknown as Project;
}

/** プロジェクトが参照する素材パスの一覧(音声+画像)。 */
export function collectAssetPaths(project: Project): string[] {
  const paths: string[] = [];
  if (project.audio) paths.push(project.audio.path);
  for (const im of project.images) paths.push(im.path);
  return paths;
}

/**
 * 素材パスの存在確認を injectable な exists 関数で行い、欠落しているパスを返す。
 * exists の実体は Tauri の fs プラグイン(呼び出し側で注入)。
 */
export async function findMissingAssets(
  project: Project,
  exists: (path: string) => Promise<boolean>,
): Promise<string[]> {
  const paths = collectAssetPaths(project);
  const results = await Promise.all(paths.map(async (p) => ({ p, ok: await exists(p) })));
  return results.filter((r) => !r.ok).map((r) => r.p);
}
