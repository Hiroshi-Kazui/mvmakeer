#!/bin/bash
# gen50.sh が使う50枚のダミー画像(1920x1080単色、色は連番から一意に導出)を生成する。
set -e
cd "$(dirname "$0")"
FF="../app/src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe"

mkdir -p testimg50
for i in $(seq 1 50); do
  r=$(( (i * 37) % 256 ))
  g=$(( (i * 91) % 256 ))
  b=$(( (i * 53) % 256 ))
  hex=$(printf "%02x%02x%02x" $r $g $b)
  "$FF" -y -f lavfi -i "color=c=0x${hex}:s=1920x1080" -frames:v 1 -update 1 "testimg50/img$(printf %03d $i).png" >/dev/null 2>&1
done
echo "generated $(ls testimg50 | wc -l) images in testimg50/"
