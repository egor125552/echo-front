#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEARCH_ROOT="${1:-$HOME/Downloads}"
TARGET="$ROOT/public/assets/audio/footsteps/library"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg не найден"
  exit 1
fi

find_dir() {
  local pattern="$1"
  find "$SEARCH_ROOT" -maxdepth 5 -type d -name "$pattern" -print -quit
}

ZAC_DIR="$(find_dir '3. ZacJoffe FPS*')"
SCP_DIR="$(find_dir '2. SCP Containment Breach*')"
OPEN_DIR="$(find_dir '1. Open Esport*')"
FPS_DIR="$(find_dir '4. FPS Asset Kit*')"

for item in \
  "ZacJoffe:$ZAC_DIR" \
  "SCP:$SCP_DIR" \
  "Open Esport:$OPEN_DIR" \
  "FPS Asset Kit:$FPS_DIR"; do
  name="${item%%:*}"
  path="${item#*:}"
  if [[ -z "$path" ]]; then
    echo "Не найдена папка: $name"
    exit 1
  fi
done

rm -rf "$TARGET"
mkdir -p \
  "$TARGET/zacjoffe" \
  "$TARGET/scp" \
  "$TARGET/open-esport-concrete" \
  "$TARGET/fps-asset-kit"

convert() {
  local src="$1"
  local dst="$2"
  if [[ ! -f "$src" ]]; then
    echo "Не найден файл: $src"
    exit 1
  fi
  ffmpeg -y -hide_banner -loglevel error \
    -i "$src" -vn -ar 48000 -c:a libmp3lame -b:a 192k "$dst"
}

# ZacJoffe: девять пока не классифицированных шагов.
for n in {0..8}; do
  convert "$ZAC_DIR/$n.ogg" "$TARGET/zacjoffe/step-$n.mp3"
done

# SCP: обычные, лесные и металлические шаги/бег.
for n in {1..8}; do
  convert "$SCP_DIR/Step$n.ogg" "$TARGET/scp/default-walk-$n.mp3"
  convert "$SCP_DIR/Run$n.ogg" "$TARGET/scp/default-run-$n.mp3"
  convert "$SCP_DIR/StepMetal$n.ogg" "$TARGET/scp/metal-walk-$n.mp3"
  convert "$SCP_DIR/RunMetal$n.ogg" "$TARGET/scp/metal-run-$n.mp3"
done
for n in {1..3}; do
  convert "$SCP_DIR/StepForest$n.ogg" "$TARGET/scp/forest-walk-$n.mp3"
  convert "$SCP_DIR/StepPD$n.ogg" "$TARGET/scp/pd-step-$n.mp3"
done

# Open Esport: весь бетонный набор — walk/jog/run/stop/jump/land.
for src in "$OPEN_DIR"/*.WAV "$OPEN_DIR"/*.wav; do
  [[ -e "$src" ]] || continue
  base="$(basename "$src")"
  base="${base%.*}"
  base="${base#Footstep_Concrete_Boots_}"
  normalized="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"
  convert "$src" "$TARGET/open-esport-concrete/$normalized.mp3"
done

# FPS Asset Kit: камень и песок, левая/правая нога.
for n in {1..3}; do
  convert "$FPS_DIR/Fantozzi-StoneL$n.ogg" "$TARGET/fps-asset-kit/stone-left-$n.mp3"
  convert "$FPS_DIR/Fantozzi-StoneR$n.ogg" "$TARGET/fps-asset-kit/stone-right-$n.mp3"
  convert "$FPS_DIR/Fantozzi-SandL$n.ogg" "$TARGET/fps-asset-kit/sand-left-$n.mp3"
  convert "$FPS_DIR/Fantozzi-SandR$n.ogg" "$TARGET/fps-asset-kit/sand-right-$n.mp3"
done

count="$(find "$TARGET" -type f -name '*.mp3' | wc -l | tr -d ' ')"
if [[ "$count" != "103" ]]; then
  echo "Ожидалось 103 MP3, получилось: $count"
  exit 1
fi

echo "Готово: $count MP3"
echo "Каталог: $TARGET"
find "$TARGET" -maxdepth 2 -type f -name '*.mp3' | sort
