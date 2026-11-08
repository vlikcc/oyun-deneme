#!/bin/sh
# Stage the publishable part of the game into ./_site for GitHub Pages.
# Copies ONLY: index.html, .nojekyll, src/, vendor/, assets/ (no docs/, tools/, etc.).
# Usage: sh tools/stage-site.sh   (run from the repo root, or from anywhere)
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SITE="$ROOT/_site"

rm -rf "$SITE"
mkdir -p "$SITE"

cd "$ROOT"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude '.DS_Store' index.html .nojekyll src vendor assets "$SITE/"
else
  cp index.html .nojekyll "$SITE/"
  cp -R src vendor assets "$SITE/"
  find "$SITE" -name '.DS_Store' -type f -exec rm -f {} +
fi

echo "staged into $SITE"
echo "top-level entries:"
ls -A "$SITE"
echo "file count: $(find "$SITE" -type f | wc -l | tr -d ' ')"
du -sh "$SITE"
