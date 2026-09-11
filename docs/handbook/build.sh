#!/usr/bin/env bash
# Rebuild docs/SSB_ERP_Development_Handbook.pdf from source.
#
#   ./docs/handbook/build.sh
#
# Appendix A and the schedule are regenerated from the repository first, so the
# route list in the PDF always matches App.tsx and navigation.ts. Sections 3, 12
# and 13 are hand-maintained — re-measure them at the end of every phase.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

CHROME="${CHROME:-$(command -v chromium || command -v chromium-browser \
    || command -v google-chrome || echo /opt/pw-browsers/chromium-1194/chrome-linux/chrome)}"

if [ ! -x "$CHROME" ]; then
  echo "No Chrome/Chromium found. Set CHROME=/path/to/chrome and re-run." >&2
  exit 1
fi

python3 docs/handbook/generate_schedule_and_appendix.py

cat docs/handbook/part1.html \
    docs/handbook/part2.html \
    docs/handbook/part3.html \
    docs/handbook/part4.html > docs/handbook/handbook.html

"$CHROME" --headless --no-sandbox --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$ROOT/docs/SSB_ERP_Development_Handbook.pdf" \
  --virtual-time-budget=8000 \
  "$ROOT/docs/handbook/handbook.html" 2>/dev/null

echo "docs/SSB_ERP_Development_Handbook.pdf rebuilt"
