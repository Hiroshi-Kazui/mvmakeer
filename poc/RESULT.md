# Phase 1 PoC結果

検証日: 2026-07-10
使用素材: `music/Holding_the_Silence.mp3`(30.77秒, mp3, 44.1kHz stereo)、`images/*.png`(3枚, 1536×1024)

## 1. xfadeクロスフェード + 音声多重化

**結果: 成功**

- 画像3枚を1920×1080にcover crop(`scale=...:force_original_aspect_ratio=increase,crop=1920:1080`)し、`xfade=transition=fade:duration=1.0` で直列チェーン
- N枚・per-image尺dの場合、オフセットは `offset_k = k*d - cf`(k=1..N-1)、出力尺は `N*d` に一致することを確認(要件定義§4.2のクロスフェード固定1.0秒と整合)
- 出力: 1920×1080/30fps/H.264+AAC、尺は音声とほぼ一致(30.73s、誤差0.04s)
- 成果物: `poc/out/01_basic_xfade.mp4`

## 2. 日本語ASS字幕焼き込み

**結果: 成功、ASS採用を確定**

- `poc/test.ass` にStyle(游明朝・72pt・影のみ縁取りなし・`\an`位置指定)+ Dialogue(`\fad(500,800)`)を定義し `-vf subtitles=test.ass` で焼き込み
- ログに `fontselect: (游明朝, 400, 0) -> YuMincho-Regular, 0, YuMincho-Regular` と出力され、**fontsdir指定なしでWindowsのfontconfigが游明朝を自動解決**することを確認(プランのHIGHリスク「ASSの日本語フォント解決」は解消)
- 中央(`\an5`)・左上(`\an7`)・右下(`\an3`)の3配置、フェードイン/アウトとも視覚的に正しく描画されることをフレーム抽出で確認
- 影(BorderStyle=1, Shadow=2)は表示され、Outline=0で縁取りなしの要件(§4.4)通りの見た目
- 成果物: `poc/out/02_ass_burned.mp4`, `poc/out/frame_center.png` 等

### drawtextとの比較(採用しなかった理由)

- drawtextは1テロップ=1フィルタノードになり、テロップ数(最大100個、要件§5)分だけフィルタグラフが線形に増える。ASSは字幕トラック1本で全テロップを表現でき、グラフが肥大しない
- フェード・位置指定はASSの `\fad`・`\an` タグで完結し、drawtextのenable式(`between(t,...)`)や座標計算より実装が単純
- → **本実装(Phase 7)はASS字幕方式を採用**

## 3. 画像50枚・10分尺のxfadeチェーン実用性

**結果: 直列チェーンのままで実用上問題なし。セグメント分割は不要**

- ダミー画像50枚(1920×1080単色, `poc/testimg50/`)、1枚あたり12秒(50枚×12秒=600秒=10分)、クロスフェード1.0秒で49連結のxfadeチェーンを構築
- フィルタグラフ文字列: 5,376バイト(問題になるサイズではない)
- エンコード実時間: **140秒**(`libx264 -preset veryfast`)、出力尺は600.000秒でmap通り
- 要件§5の想定規模(画像~50枚・10分曲)に対し、単一`filter_complex`のままで十分な速度
- → プランのHIGHリスク「xfade 50枚チェーンの実用性」は解消。**セグメント分割+concatへのフォールバックは不要と判定**
- 成果物: `poc/out/03_xfade50.mp4`, `poc/gen50.sh`(生成スクリプト), `poc/out/xfade50_log.txt`(実行ログ)
- 注記: 実画像(JPEG/PNG、単色よりデコード負荷が高い)での再検証はしていない。Phase 7の実装時、実素材での書き出しリハーサルを行うこと

## 結論・Phase 7への申し送り

| 技術判断 | 確定内容 |
|---|---|
| テロップ焼き込み方式 | **ASS字幕**(要件定義§8の未決事項を確定) |
| フォント指定 | 游明朝等のシステムフォント名をそのままStyle行のFontnameに指定すればよい。`fontsdir`指定は不要 |
| クロスフェード方式 | 直列`xfade`チェーンのまま(セグメント分割不要) |
| オフセット計算式 | `offset_k = k*d - cf`(kは1始まりの遷移番号、dは1枚あたり尺、cfはクロスフェード秒数) |

Phase 7(`export/assBuilder.ts`, `export/ffmpegCommand.ts`)はこの結果に従って実装する。
