# MV Maker

画像+音声からスライドショーMVを作り、曲を再生しながらテロップを打ち込むデスクトップツール。

## 必読ドキュメント(作業開始時)

1. `PROGRESS.md` — 現在のフェーズと完了条件。**ここを見てから作業を始める**
2. `plans/mvmaker-v1-2026-07-10.md` — 8フェーズの実装プラン(技術判断7項目を含む)
3. `要件定義.md` — 仕様の一次ソース
4. Phase 1 完了後は `poc/RESULT.md` — ffmpeg の確定コマンド形。書き出し実装はこれに従う

## スタック / 構成

- Tauri 2 + TypeScript + Vite(素のTS、UIフレームワーク不使用)/ Rust / ffmpeg サイドカー
- `app/` = フロント + `app/src-tauri/` = Rust。UIの土台は `mocks/mvmaker-ui.html`
- ffmpeg バイナリは git 管理外(`src-tauri/binaries/`)。無ければ `scripts/fetch-ffmpeg.ps1` を実行して配置

## コマンド(`app/` で実行)

| 目的 | コマンド |
|---|---|
| 起動 | `npm run tauri dev`(長時間走る→バックグラウンド起動し、確認後停止) |
| 型チェック | `npx tsc --noEmit` |
| 単体テスト | `npx vitest run` |
| Rust検査 | `cargo check`(`app/src-tauri/` で) |
| まとめて | `/smoke` |

## 実装ルール

- **フェーズ順序はプラン厳守**。各フェーズの動作確認を満たしてから次へ。完了時は `/phase-done`
- プレビューと書き出しの共有パラメータ(クロスフェード時間・フェードカーブ・カバークロップ計算)は `src/shared/params.ts` に一元化。両者で別々に定義しない
- 時刻は全て秒(number・小数)。表示フォーマットは `ui/format.ts` のみで行う
- テロップの時刻正規化(tIn < tFo ≤ tEnd、重なり詰め)は `logic/timing.ts` に集約。UI側から直接時刻を書き換えない
- ロジック層(timing / assBuilder / ffmpegCommand)は vitest のテスト必須。UI層は手動確認でよい
- OS依存処理(パス、フォント列挙)は分離して書く — 将来の macOS ビルドを阻害しない
- UI文字列は日本語

## Git

- 意味のある単位ごとに commit & push(ユーザー承認済み)
- フェーズ完了コミットには `PROGRESS.md` の更新を含める

## Windows 注意

- Bash ツールではパスをフォワードスラッシュで書く(`C:/develop/mvmaker`)
- `tauri dev` の初回は Rust コンパイルで数分かかる。タイムアウトを長めに
