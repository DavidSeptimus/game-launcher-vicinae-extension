#!/usr/bin/env bash
# Copy the extension, as of a git ref, into a vicinae-extensions checkout at extensions/game-launcher.
#
# The store builds with npm, so the copy gets a package-lock.json instead of the pnpm files, and drops the
# packageManager field. A lockfile already in the store copy is kept and only updated where package.json changed,
# so re-syncing the same release gives the same result. Repo-only material (release tooling, development docs,
# icon sources) stays behind. Nothing is committed.
#
# Usage: scripts/sync-to-store.sh <vicinae-extensions checkout> [git ref, default HEAD]
# The ref is read from this script's repo, or from the repo at $SOURCE_REPO if set. With NO_LOCKFILE=1, the store's
# package-lock.json is left as it is instead of being updated (no npm needed); scripts/store-match.sh uses this.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <vicinae-extensions checkout> [git ref]" >&2
  exit 2
fi

store=$(realpath "$1")
ref=${2:-HEAD}
repo=$(git -C "${SOURCE_REPO:-$(dirname "$0")}" rev-parse --show-toplevel)
dest="$store/extensions/game-launcher"

if [[ ! -f "$store/scripts/validate-extension.ts" || ! -d "$store/extensions" ]]; then
  echo "not a vicinae-extensions checkout: $store" >&2
  exit 1
fi
if ! commit=$(git -C "$repo" rev-parse --verify --quiet "$ref^{commit}"); then
  echo "no such commit or tag: $ref" >&2
  exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [[ -f "$dest/package-lock.json" ]]; then
  cp "$dest/package-lock.json" "$tmp/package-lock.json"
fi

# Start from an empty directory so files deleted here are deleted in the store too.
rm -rf "$dest"
mkdir -p "$dest"

git -C "$repo" archive --format=tar "$commit" | tar -x -C "$dest" --anchored \
  --exclude=.github \
  --exclude=scripts \
  --exclude=docs/development.md \
  --exclude=assets-src \
  --exclude=pnpm-lock.yaml \
  --exclude=pnpm-workspace.yaml \
  --exclude=vicinae-env.d.ts

cd "$dest"

# The store README is the README's <!-- description --> ... <!-- end-description --> blocks, joined in order.
# Everything outside them (installing from source, development) stays in this repo only.
awk '
  function fail(msg) { print "README.md: " msg > "/dev/stderr"; failed = 1; exit 1 }
  /^<!-- *description *-->[[:space:]]*$/ {
    if (inside) fail("nested <!-- description --> at line " NR)
    inside = 1; blocks++; if (blocks > 1) print ""; next
  }
  /^<!-- *end-description *-->[[:space:]]*$/ {
    if (!inside) fail("<!-- end-description --> without a <!-- description --> at line " NR)
    inside = 0; next
  }
  inside
  END {
    if (failed) exit 1
    if (inside) fail("<!-- description --> is never closed")
    if (!blocks) fail("no <!-- description --> blocks to copy to the store")
  }
' README.md | cat -s | sed -e '${/^$/d;}' > "$tmp/README.md"
mv "$tmp/README.md" README.md

node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  delete pkg.packageManager;
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
if [[ -f "$tmp/package-lock.json" ]]; then
  cp "$tmp/package-lock.json" package-lock.json
fi
if [[ "${NO_LOCKFILE:-}" != 1 ]]; then
  # Same peer-dependency mode as the store CI (npm ci --legacy-peer-deps).
  npm install --package-lock-only --legacy-peer-deps --no-audit --no-fund
fi

echo "Synced ${commit:0:7} ($ref) to $dest"
