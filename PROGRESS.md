# 実装進捗

現在のフェーズ: **Phase 7(未着手)**

プラン: `plans/mvmaker-v1-2026-07-10.md` / 要件: `要件定義.md`

## フェーズ状況

- [x] **Phase 0: スキャフォールド** — `tauri dev` でウィンドウが開き、sidecar `ffmpeg -version` が取得できる
- [x] **Phase 1: ffmpeg PoC** — 日本語テロップ+クロスフェード+音声の mp4 生成OK、50枚方式確定、`poc/RESULT.md` 記録済み
- [x] **Phase 2: ドメインモデル** — timing ロジックの vitest 通過、.mvproj 保存→読込ラウンドトリップ一致
- [x] **Phase 3: UIシェル・素材管理** — 実ファイルで素材一覧・並べ替え・差し替えが機能
- [x] **Phase 4: プレビューエンジン** — 実素材で再生・シークでき、画像・テロップ表示が正しい
- [x] **Phase 5: テロップ打ち込み** — 曲を流しながら10個打ち込み→修正の一連が動く
- [x] **Phase 6: タイムライン** — ドラッグ編集が即時反映、波形表示が音と一致
- [ ] **Phase 7: 書き出し** — 書き出した mp4 がプレビューと一致(フェード位置±0.1s目安)
- [ ] **Phase 8: 仕上げ** — 非機能要件充足、未保存ガード・確認ダイアログ完備

## 更新ログ

- 2026-07-10: リポジトリ初期化、要件定義・プラン・モック・ハーネス整備
- 2026-07-10: Phase 0 完了。Tauri 2 + vanilla-ts スキャフォールド、plugin-dialog/shell/fs、ffmpegサイドカー(BtbN GPLビルド)配置。ウィンドウ起動+sidecar `ffmpeg -version` 呼び出しをスクリーンショットで確認
- 2026-07-10: Phase 1 完了。実素材(`music/Holding_the_Silence.mp3` + `images/*.png`)でxfade+音声多重化とASS日本語字幕焼き込みを検証、画像50枚・10分尺のxfadeチェーンを140秒でエンコードできることを実測。ASS字幕方式・直列xfadeチェーン(セグメント分割不要)を確定。詳細は `poc/RESULT.md`
- 2026-07-10: Phase 2 完了。types.ts/logic/timing.ts/logic/projectFile.ts(+projectFileIO.ts)/state.ts を実装。vitest 24件通過(実装中に setFadeOutAt の実バグ1件を検出・修正)、.mvproj ラウンドトリップ一致を確認
- 2026-07-10: Phase 3 完了。mocks/mvmaker-ui.html を index.html/styles.css/ui/materials.ts に移植(歌詞キューは除去)。実ファイル(images/*.png, music/Holding_the_Silence.mp3)で画像追加・convertFileSrcサムネイル表示・均等割り再配分・削除・音声duration取得をアプリ実機のスクリーンショットで確認
- 2026-07-10: Phase 4 完了。shared/params.ts(クロスフェード秒数等の一元化)、preview/engine.ts(画像クロスフェード・テロップ9分割位置・トランスポート)を実装。vitest 13件追加(poc/RESULT.mdの数式検証、実装中に終端境界の実バグ1件を検出・修正)。実アプリで再生・シークバー・矢印キーでのシーク・クロスフェード・再生完了時の3枚目表示をスクリーンショットで確認。既知の未検証事項: Spaceキーでの再生開始をSendKeys経由の自動操作で検証できなかった(ArrowRight/Leftとマウスクリックは正常動作を確認済みで、コード上はSpaceも同一のkeydownリスナー経由のため機能する見込みだが、実機での直接確認は次回ユーザー操作時に推奨)
- 2026-07-10: Phase 5 完了。ui/inspector.ts(テキスト/フォント/サイズ/色/9分割位置/タイミングステッパー)、ui/telopActions.ts(挿入・フェードアウト・削除、I/O/Delキー)を実装。実アプリで1テロップの挿入→テキスト入力→プレビュー反映→フェードアウト位置設定(現在時刻が正しく反映)→削除確認ダイアログのキャンセルまでをスクリーンショットで確認。重なり自動詰め・境界クランプ等のロジックはPhase 2のvitest(insertTelop/setFadeOutAt)で担保。「10個打ち込み」の連続操作は自動化テストでは実施せず(1件のフルフロー+ロジック単体テストで代替)
- 2026-07-10: Phase 6 完了。logic/timing.tsに adjustImageBoundary(境界ドラッグ専用、隣接2枚のみ調整。setImageDurationの全体再配分とは意図的に別実装)/setTelopStart/setTelopEnd/moveTelopを追加(vitest 11件追加、計48件)。preview/waveform.ts(Web Audio decodeAudioData→ピーク抽出→SVG波形)、ui/timeline.ts(ルーラー・プレイヘッド・レーン分割・ドラッグ)を実装。preview/engine.tsにpreviewWithOverridesを追加し、ドラッグ中はstate確定前にプレビューのみ即時更新。実アプリで実素材+実音声波形を表示し、画像境界ドラッグ(12.7秒/7.8秒(固定)に反映、3枚目は無変更)とテロップクリップ移動ドラッグ(timeIn/fadeOutStartが正しく連動)を確認。実装中に発見・修正した実バグ: `.img-clip`の`pointer-events:none`が境界ハンドル子要素に継承されクリック不能だった(専用クラス`.img-boundary`で解決)
