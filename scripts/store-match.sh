#!/usr/bin/env bash
# Show what a store commit has that a commit of this repo doesn't: for copying a store maintainer's changes into a
# release branch (docs/development.md, "Cutting a release").
#
# Checks out the store commit, runs sync-to-store.sh on top of it for the ref, and compares extensions/game-launcher.
# package-lock.json isn't compared (or regenerated): the sync generates it and it isn't in this repo.
# Exits 0 if they're identical, 1 if they differ (printing the difference as a diff from the synced ref to the store,
# in store paths; the store's README is only the description blocks of ours), and 2 if it couldn't compare (bad
# arguments, a fetch or sync that failed).
#
# Usage: scripts/store-match.sh <clone of this repo> <git ref> <store commit sha>
# Env:   UPSTREAM (the store repo, default vicinaehq/extensions), STORE_DIR (optional empty or missing directory to
#        check the store out into and keep; a temporary one is removed otherwise).
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 <clone of this repo> <git ref> <store commit sha>" >&2
  exit 2
fi
repo=$(realpath "$1")
ref=$2
commit=$3
upstream=${UPSTREAM:-vicinaehq/extensions}

# Anything failing before the comparison is "couldn't compare".
trap 'exit 2' ERR

if [[ -n "${STORE_DIR:-}" ]]; then
  store=$STORE_DIR
  if [[ -n "$(ls -A "$store" 2>/dev/null)" ]]; then
    echo "STORE_DIR is not empty: $store" >&2
    exit 2
  fi
else
  store=$(mktemp -d)
  trap 'rm -rf "$store"' EXIT
fi

# Only what sync-to-store.sh needs: the extension and the store's scripts (it checks for validate-extension.ts).
git init --quiet "$store"
git -C "$store" sparse-checkout set extensions/game-launcher scripts
git -C "$store" fetch --quiet --depth=1 --filter=blob:none "https://github.com/$upstream.git" "$commit"
git -C "$store" checkout --quiet --detach FETCH_HEAD

# Only the comparison goes to stdout.
NO_LOCKFILE=1 SOURCE_REPO=$repo "$(dirname "$0")/sync-to-store.sh" "$store" "$ref" >&2

trap - ERR
git -C "$store" add --all -- extensions/game-launcher
if git -C "$store" diff --cached --quiet -- extensions/game-launcher; then
  echo "Matches." >&2
  exit 0
fi
git -C "$store" diff --cached -R --stat -- extensions/game-launcher
echo
git -C "$store" diff --cached -R -- extensions/game-launcher
exit 1
