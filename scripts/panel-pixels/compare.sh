#!/bin/bash
# Pixel diff of the Front Panel fixture (DT-058 §9): BEFORE drawn by another checkout, AFTER by this one.
#
#   scripts/panel-pixels/compare.sh <before checkout> <work directory> [after panel style] [before panel style]
#
# Make BEFORE with `git worktree add --detach <dir> <commit>`. Prints one line per scene and exits with 1 if any differ.
# Uses the virtual screen of the labview skill (Xvfb :99), started here if it is not running.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
BEFORE_CHECKOUT=$1
WORK=$2
AFTER_STYLE=${3:-old-school}
BEFORE_STYLE=${4:-old-school}
MEASURE="$REPO/.claude/skills/labview/scripts/measure.py"
ELECTRON="$REPO/node_modules/electron/dist/electron"

pgrep -x Xvfb >/dev/null || { Xvfb :99 -screen 0 1920x1080x24 >/dev/null 2>&1 & sleep 1; }
rm -rf "$WORK/before" "$WORK/after"
node "$REPO/scripts/panel-pixels/render.mjs" "$BEFORE_CHECKOUT" "$WORK/before" "$BEFORE_STYLE"
node "$REPO/scripts/panel-pixels/render.mjs" "$REPO" "$WORK/after" "$AFTER_STYLE"
for side in before after; do
  DISPLAY=:99 GTK_USE_PORTAL=0 "$ELECTRON" --no-sandbox "$REPO/scripts/panel-pixels/capture.cjs" "$WORK/$side" 2>/dev/null | grep captures
done

status=0
for before in "$WORK"/before/*.png; do
  scene=$(basename "$before" .png)
  result=$(/usr/bin/python3 "$MEASURE" diff "$before" "$WORK/after/$scene.png")
  echo "$scene: $result"
  [ "$result" = identical ] || status=1
done
exit $status
