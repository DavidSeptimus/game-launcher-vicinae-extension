#!/usr/bin/env bash
# Report the store side of a release as key=value lines, for the release workflows.
#
# Usage: scripts/store-state.sh <clone of this repo> [vX.Y.Z]
# Env:   FORK (owner/repo of the store fork), UPSTREAM (the store repo), BRANCH (the fork branch),
#        GH_TOKEN (read access), STORE_DIR (optional git repo to fetch the fork branch into; temporary otherwise).
#
#   open_pr        open store pull request from the fork branch, or empty
#   tip            head of the fork branch, or empty if there is no branch
#   tip_pr         open | closed | merged | none: state of the store pull request whose head is the tip
#   last_sync      newest commit on the fork branch with a Source-Commit trailer (made by store-release.yml)
#   last_source    the commit in this repo that trailer names
#   tip_release    the release (vX.Y.Z) last_source was made for, or empty
# With a tag:
#   merged_pr      newest merged store pull request with a commit made for the tag, or empty if none
#   merged_source  the last Source-Commit made for the tag in that pull request
#   merged_extra   how many commits in that pull request came after it without a Source-Commit trailer
#
# A commit is "made for" vX.Y.Z when the newest "Release vX.Y.Z"-style commit on its first-parent history is
# "Release vX.Y.Z", i.e. it sits on that release branch. This holds even after the branch is rewritten.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <clone of this repo> [vX.Y.Z]" >&2
  exit 2
fi
repo=$1
tag=${2:-}
owner=${FORK%%/*}

release_of() {
  local sha=$1
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || return 0
  if ! git -C "$repo" cat-file -e "$sha^{commit}" 2>/dev/null; then
    git -C "$repo" fetch --quiet origin "$sha" 2>/dev/null || return 0
  fi
  git -C "$repo" log --first-parent --format=%s "$sha" \
    | awk '/^Release v[0-9]+\.[0-9]+\.[0-9]+$/ && !found { print substr($0, 9); found = 1 }'
}

pulls=$(gh api "repos/$UPSTREAM/pulls?head=$owner:$BRANCH&state=all&per_page=100")
open_pr=$(jq -r '[.[] | select(.state == "open")][0].number // empty' <<<"$pulls")
tip=$(git ls-remote "https://github.com/$FORK.git" "refs/heads/$BRANCH" | cut -f1)

tip_pr=none last_sync="" last_source="" tip_release=""
if [[ -n "$tip" ]]; then
  tip_pr=$(jq -r --arg sha "$tip" \
    '[.[] | select(.head.sha == $sha)][0] | if . == null then "none" elif .merged_at then "merged" else .state end' \
    <<<"$pulls")
  store=${STORE_DIR:-$(mktemp -d)}
  [[ -d "$store/.git" ]] || git init --quiet "$store"
  git -C "$store" fetch --quiet --depth=50 "https://github.com/$FORK.git" "$tip"
  line=$(git -C "$store" log --format='%H%x09%(trailers:key=Source-Commit,valueonly,separator=%x2C)' "$tip" \
    | awk -F'\t' '$2 != "" && !found { print; found = 1 }')
  if [[ -n "$line" ]]; then
    last_sync=${line%%$'\t'*}
    last_source=${line#*$'\t'}
    tip_release=$(release_of "$last_source")
  fi
fi

merged_pr="" merged_source="" merged_extra=0
if [[ -n "$tag" ]]; then
  for number in $(jq -r '[.[] | select(.merged_at)] | sort_by(.merged_at) | reverse | .[:10][] | .number' <<<"$pulls"); do
    commits=$(gh api "repos/$UPSTREAM/pulls/$number/commits?per_page=100" \
      --jq '[.[] | ((.commit.message | capture("(?m)^Source-Commit: (?<s>[0-9a-f]{40})$").s) // "")]')
    count=$(jq length <<<"$commits")
    for ((i = count - 1; i >= 0; i--)); do
      source=$(jq -r ".[$i]" <<<"$commits")
      if [[ -n "$source" && "$(release_of "$source")" == "$tag" ]]; then
        merged_pr=$number
        merged_source=$source
        merged_extra=$(jq --argjson i "$i" '[.[$i + 1:][] | select(. == "")] | length' <<<"$commits")
        break 2
      fi
    done
  done
fi

cat <<EOF
open_pr=$open_pr
tip=$tip
tip_pr=$tip_pr
last_sync=$last_sync
last_source=$last_source
tip_release=$tip_release
merged_pr=$merged_pr
merged_source=$merged_source
merged_extra=$merged_extra
EOF
