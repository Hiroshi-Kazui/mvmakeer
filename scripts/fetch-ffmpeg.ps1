# ffmpeg サイドカーを取得して app/src-tauri/binaries/ に配置する
#
# 供給元: BtbN/FFmpeg-Builds の win64 GPL ビルド
#   - libass 入り(ASS字幕焼き込みに必要)
#   - zip 形式なので追加ツール不要(プランで挙げた gyan.dev full は 7z のためこちらを採用)
#   - GPL ライセンス: 個人利用は問題なし。配布時は要件定義 §8 に従い再検討
#
# Tauri の externalBin 規約により、ファイル名は target triple サフィックス必須:
#   ffmpeg-x86_64-pc-windows-msvc.exe

$ErrorActionPreference = "Stop"

$binDir = Join-Path $PSScriptRoot "..\app\src-tauri\binaries"
$ffmpegDest = Join-Path $binDir "ffmpeg-x86_64-pc-windows-msvc.exe"
$ffprobeDest = Join-Path $binDir "ffprobe-x86_64-pc-windows-msvc.exe"

if ((Test-Path $ffmpegDest) -and (Test-Path $ffprobeDest)) {
    Write-Host "既に配置済み: $ffmpegDest"
    exit 0
}

$url = "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip"
$tmp = Join-Path $env:TEMP "mvmaker-ffmpeg-dl"
$zip = Join-Path $tmp "ffmpeg.zip"

New-Item -ItemType Directory -Force $tmp | Out-Null
Write-Host "ダウンロード中: $url"
Invoke-WebRequest -Uri $url -OutFile $zip

Write-Host "展開中..."
Expand-Archive -Path $zip -DestinationPath $tmp -Force

$ffmpegSrc = Get-ChildItem -Path $tmp -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
$ffprobeSrc = Get-ChildItem -Path $tmp -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
if (-not $ffmpegSrc) { throw "展開結果に ffmpeg.exe が見つかりません" }

New-Item -ItemType Directory -Force $binDir | Out-Null
Copy-Item $ffmpegSrc.FullName $ffmpegDest -Force
if ($ffprobeSrc) { Copy-Item $ffprobeSrc.FullName $ffprobeDest -Force }

Remove-Item -Recurse -Force $tmp

Write-Host "配置完了:"
Write-Host "  $ffmpegDest"
if ($ffprobeSrc) { Write-Host "  $ffprobeDest" }
& $ffmpegDest -version | Select-Object -First 1
