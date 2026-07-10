# MV Maker

画像+音声からスライドショー形式のミュージックビデオを作成する Windows デスクトップツール。
曲を再生しながらテロップを打ち込み、mp4 として書き出せます。詳細は `要件定義.md` を参照。

## セットアップ

前提: Node.js 18+、Rust(stable)、npm

```bash
cd app
npm install
```

### ffmpeg サイドカーの配置(初回のみ)

ffmpeg バイナリは git 管理外です。以下のスクリプトで取得・配置してください
(BtbN/FFmpeg-Builds の Windows GPL ビルド、libass 入り)。

```powershell
powershell -File scripts/fetch-ffmpeg.ps1
```

`app/src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe` と
`ffprobe-x86_64-pc-windows-msvc.exe` が配置されます。

## 開発

```bash
run.cmd
```

または

```bash
cd app
npm run tauri dev
```

## テスト・検証

```bash
cd app
npx tsc --noEmit      # 型チェック
npx vitest run        # 単体テスト
cd src-tauri && cargo check   # Rust検査
```

まとめて実行する場合は `/smoke` コマンド(Claude Code)を使用。

## ビルド

```bash
cd app
npm run tauri build
```

## ディレクトリ構成

| パス | 内容 |
|---|---|
| `app/` | Tauri 2 + TypeScript + Vite アプリ本体 |
| `app/src/logic/` | 純粋ロジック(タイミング計算、プロジェクトファイルI/O) |
| `app/src/preview/` | プレビューエンジン(再生・波形) |
| `app/src/export/` | 書き出し(ASS字幕生成、ffmpegコマンド構築) |
| `app/src/ui/` | UI各パネルの配線 |
| `app/src-tauri/` | Rust側(ffmpeg sidecar実行等) |
| `poc/` | Phase 1 の ffmpeg 方式検証(`RESULT.md` に結論) |
| `mocks/` | UI モック(実装前のデザイン検討用) |
| `plans/` | 実装プラン |

## ライセンス上の注意

同梱を想定している ffmpeg ビルド(BtbN/FFmpeg-Builds gpl 版)は GPL です。
個人利用の範囲では問題ありませんが、配布する場合はライセンス表記または
LGPL 構成のビルドへの差し替えを検討してください(要件定義§8参照)。
