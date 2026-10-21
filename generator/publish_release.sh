#!/usr/bin/env bash
# Attach the full dataset to a GitHub release of this repository.
#   generator/publish_release.sh <build_dir>/v1/full <tag>
# Each Parquet file becomes one asset; the asset name is the file's path under
# full/ with "/" replaced by "__" (release assets cannot be nested). Download
# URL pattern: https://github.com/ThomUK/synthetic-hospital-data/releases/download/<tag>/<asset>
set -euo pipefail
dir="$1"; tag="$2"; repo="ThomUK/synthetic-hospital-data"
title="Synthetic hospital dataset ${tag}: full set"
notes="Full-scale build of the Fake NHS Trust synthetic dataset (every row). The 5% sample, the docs and the SQL live in the repository under data/, docs/ and sql/. Asset names are the paths under full/ with '/' replaced by '__'."
# create the release if it does not exist (REST API)
if ! gh api "repos/$repo/releases/tags/$tag" >/dev/null 2>&1; then
  gh api -X POST "repos/$repo/releases" -f tag_name="$tag" -f target_commitish=main -f name="$title" -f body="$notes" -F draft=false -F prerelease=false >/dev/null
  echo "created release $tag"
fi
rid=$(gh api "repos/$repo/releases/tags/$tag" --jq '.id')
existing=$(gh api "repos/$repo/releases/$rid/assets" --paginate --jq '.[].name' || true)
cd "$dir"
find . -name "*.parquet" -type f | sort | while read -r f; do
  name=$(echo "${f#./}" | sed 's#/#__#g')
  if echo "$existing" | grep -qx "$name"; then echo "skip $name"; continue; fi
  echo "upload $name ($(du -h "$f" | cut -f1))"
  curl -sS --fail -X POST -H "Authorization: Bearer ${GH_TOKEN:-$(gh auth token)}" -H "Content-Type: application/octet-stream" \
       --data-binary @"$f" "https://uploads.github.com/repos/$repo/releases/$rid/assets?name=$name" >/dev/null
done
echo "done: https://github.com/$repo/releases/tag/$tag"
