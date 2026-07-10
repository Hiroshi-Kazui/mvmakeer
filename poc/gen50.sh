#!/bin/bash
# Generate a 50-image xfade filter_complex and time the encode.
set -e
cd "$(dirname "$0")"
FF="../app/src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe"

N=50
D=12.0    # per-image nominal duration (seconds)
CF=1.0    # crossfade duration

calc() { awk "BEGIN { printf \"%.3f\", $1 }"; }

INPUTS=""
SCALE=""
for i in $(seq 0 $((N-1))); do
  idx=$(printf %03d $((i+1)))
  INPUTS="$INPUTS -loop 1 -t $(calc "$D + $CF") -i testimg50/img${idx}.png"
  SCALE="${SCALE}[${i}:v]scale=1920:1080,setsar=1,fps=30[v${i}];"
done

# build xfade chain
CHAIN=""
prev="v0"
for i in $(seq 1 $((N-1))); do
  offset=$(calc "$i * $D - $CF")
  out="vx${i}"
  if [ "$i" -eq "$((N-1))" ]; then out="vout"; fi
  CHAIN="${CHAIN}[${prev}][v${i}]xfade=transition=fade:duration=${CF}:offset=${offset}[${out}];"
  prev="$out"
done

FILTER="${SCALE}${CHAIN}"
FILTER="${FILTER%;}"

echo "$FILTER" > filter50.txt
echo "$INPUTS" > inputs50.txt
echo "Filter graph length: $(wc -c < filter50.txt) bytes, $((N-1)) xfade transitions"

TOTAL=$(calc "$N * $D")
echo "Expected total duration: ${TOTAL}s"

START=$(date +%s)
# shellcheck disable=SC2086
"$FF" -y $INPUTS -filter_complex "$FILTER" -map "[vout]" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -t "$TOTAL" \
  out/03_xfade50.mp4 > out/xfade50_log.txt 2>&1
END=$(date +%s)
echo "Elapsed: $((END-START))s"
tail -5 out/xfade50_log.txt
