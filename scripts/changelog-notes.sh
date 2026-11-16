#!/usr/bin/env bash
# Print one section of CHANGELOG.md (Keep a Changelog), without its heading.
# The section is "## [X.Y.Z] - date" for a release (pass vX.Y.Z or X.Y.Z), or "## [Unreleased]" (pass Unreleased).
# It ends at the next "## " heading or at the link references at the bottom. Fails if it is missing or has no
# entries (headings alone don't count).
#
# Usage: scripts/changelog-notes.sh <CHANGELOG.md> <vX.Y.Z | X.Y.Z | Unreleased>
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <CHANGELOG.md> <vX.Y.Z | X.Y.Z | Unreleased>" >&2
  exit 2
fi

if [[ "${2,,}" == unreleased ]]; then
  heading='^## \[?Unreleased\]?[[:space:]]*$'
else
  version=${2#v}
  heading="^## \\[?v?${version//./\\.}\\]?([^0-9.]|\$)"
fi

notes=$(HEADING=$heading awk '
  /^## / { if (found) exit; if ($0 ~ ENVIRON["HEADING"]) { found = 1; next } }
  /^\[[^]]+\]: / { if (found) exit }
  found
' "$1" | sed -e '/./,$!d')  # drop leading blank lines; $(...) drops trailing ones

# Headings alone (e.g. a "### Added" left with nothing under it) don't count as entries.
if ! grep -qv -e '^#' -e '^[[:space:]]*$' <<<"$notes"; then
  echo "$1 has no entries under '## [${2#v}]'" >&2
  exit 1
fi
printf '%s\n' "$notes"
