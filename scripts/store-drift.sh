#!/usr/bin/env bash
# Check that changes the store made to its copy of the extension since a release are in a commit of this repo, so
# releasing that commit won't undo them.
#
# The store's main changes extensions/game-launcher without us: store-wide maintainer sweeps (an @vicinae/api bump, a
# new manifest field), direct maintainer fixes, or someone else's merged pull request. A release starts from the
# store's main and replaces the extension with ours, so each of those has to be in the commit being released.
#
# "The store's changes" are what the store commit has that the release doesn't (scripts/store-match.sh). They're in
# the candidate when undoing them still applies to the candidate's synced tree, the same test store-release.yml uses
# for commits on the fork branch, but ignoring context lines (-C0) so our own later edits next to a store change don't
# count as missing it. A store change the candidate deliberately replaced (say, a newer @vicinae/api than the store's
# bump) still counts as missing; the release workflow has an input to go ahead anyway. package-lock.json isn't
# compared (see store-match.sh).
#
# Exits 0 if the store has nothing the release lacks, or the candidate has all of it; 1 if the candidate is missing
# some of it (printing what the store changed since the release, as a diff in store paths); 2 if it couldn't compare.
#
# Usage: scripts/store-drift.sh <clone of this repo> <release ref, e.g. v1.0.0> <candidate ref> <store commit sha>
# Env:   UPSTREAM (the store repo, default vicinaehq/extensions).
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "usage: $0 <clone of this repo> <release ref> <candidate ref> <store commit sha>" >&2
  exit 2
fi
repo=$1
release=$2
candidate=$3
commit=$4
here=$(dirname "$0")

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# What the store has that the release doesn't.
set +e
STORE_DIR=$tmp/release "$here/store-match.sh" "$repo" "$release" "$commit" > /dev/null
status=$?
set -e
case $status in
  0) echo "The store has nothing that $release doesn't." >&2; exit 0 ;;
  1) ;;
  *) exit 2 ;;
esac
git -C "$tmp/release" diff --cached -R --binary -- extensions/game-launcher > "$tmp/theirs.patch"

# Are those changes in the candidate? Undoing them must apply to its synced tree.
set +e
STORE_DIR=$tmp/candidate "$here/store-match.sh" "$repo" "$candidate" "$commit" > /dev/null
status=$?
set -e
case $status in
  0|1) ;;
  *) exit 2 ;;
esac
if git -C "$tmp/candidate" apply --cached --check -R -C0 "$tmp/theirs.patch" 2>/dev/null; then
  echo "The store changed the extension since $release, and $candidate has those changes." >&2
  exit 0
fi

git -C "$tmp/release" diff --cached -R --stat -- extensions/game-launcher
echo
cat "$tmp/theirs.patch"
exit 1
