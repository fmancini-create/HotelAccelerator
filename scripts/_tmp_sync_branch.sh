#!/usr/bin/env bash
# One-shot: create a clean branch from stable-gmail HEAD and apply the current
# working-dir contents for every file that differs from stable-gmail, via the
# GitHub Git Data API. Bypasses local git auth and squash-merge divergence.
set -euo pipefail

# Strip stale auth tokens inherited from env; let gh use its own keyring.
unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN || true

OWNER="fmancini-create"
REPO="HotelAccelerator"
BASE_BRANCH="stable-gmail"
SOURCE_BRANCH="v0/4bidsrl-8adf5f23"
TARGET_BRANCH="ship-crm-signature-fixes"

cd /vercel/share/v0-project

echo "[1/6] Fetching stable-gmail HEAD..."
BASE_SHA=$(gh api "repos/${OWNER}/${REPO}/branches/${BASE_BRANCH}" --jq '.commit.sha')
echo "  base SHA: ${BASE_SHA:0:12}"

echo "[2/6] Listing changed files (stable-gmail...source)..."
# Include only product files; exclude tmp scripts, build output, lockfile tsbuildinfo.
gh api "repos/${OWNER}/${REPO}/compare/${BASE_BRANCH}...${SOURCE_BRANCH}" --paginate \
  --jq '.files[] | "\(.status)\t\(.filename)"' \
  | grep -vE '^[^	]+	(scripts/_tmp_|tsconfig\.tsbuildinfo|\.next/|node_modules/)' \
  > /tmp/changed_files.txt
wc -l /tmp/changed_files.txt
head -5 /tmp/changed_files.txt

echo "[3/6] Creating blobs / tree entries..."
: > /tmp/tree_entries.json
while IFS=$'\t' read -r STATUS FILENAME; do
  case "$STATUS" in
    added|modified|renamed|changed|copied)
      if [[ ! -f "$FILENAME" ]]; then
        echo "  SKIP (not on disk): $FILENAME"
        continue
      fi
      # Upload blob (base64 to preserve binaries; works for text too).
      BLOB_PAYLOAD=$(mktemp --suffix=.json)
      jq -n --arg content "$(base64 -w0 "$FILENAME")" --arg encoding "base64" \
        '{content:$content, encoding:$encoding}' > "$BLOB_PAYLOAD"
      BLOB_SHA=$(gh api -X POST "repos/${OWNER}/${REPO}/git/blobs" --input "$BLOB_PAYLOAD" --jq '.sha')
      rm -f "$BLOB_PAYLOAD"
      jq -n --arg path "$FILENAME" --arg sha "$BLOB_SHA" \
        '{path:$path, mode:"100644", type:"blob", sha:$sha}' >> /tmp/tree_entries.json
      echo "  blob ${BLOB_SHA:0:10}  $FILENAME"
      ;;
    removed)
      jq -n --arg path "$FILENAME" \
        '{path:$path, mode:"100644", type:"blob", sha:null}' >> /tmp/tree_entries.json
      echo "  delete          $FILENAME"
      ;;
    *)
      echo "  ?? status=$STATUS file=$FILENAME (skipping)"
      ;;
  esac
done < /tmp/changed_files.txt

echo "[4/6] Creating tree..."
TREE_PAYLOAD=$(mktemp --suffix=.json)
jq -s --arg base "$BASE_SHA" '{base_tree:$base, tree:.}' /tmp/tree_entries.json > "$TREE_PAYLOAD"
TREE_SHA=$(gh api -X POST "repos/${OWNER}/${REPO}/git/trees" --input "$TREE_PAYLOAD" --jq '.sha')
rm -f "$TREE_PAYLOAD"
echo "  tree ${TREE_SHA:0:12}"

echo "[5/6] Creating commit..."
COMMIT_MSG='CRM auto-capture + firma rich-text in tutti i send endpoint

- crm_auto_capture_settings + policy layer (lib/crm/auto-capture)
- Send endpoints: auto-capture TO, append firma rich-text
- Signature editor rich-text + sanitize server-side (sanitize-html)
- Fix Turbopack build (no more node:worker_threads via jsdom)
- Platform chrome globale + fix scroll Inbox

Co-authored-by: v0[bot] <v0[bot]@users.noreply.github.com>'
COMMIT_PAYLOAD=$(mktemp --suffix=.json)
jq -n --arg msg "$COMMIT_MSG" --arg tree "$TREE_SHA" --arg parent "$BASE_SHA" \
  '{message:$msg, tree:$tree, parents:[$parent]}' > "$COMMIT_PAYLOAD"
COMMIT_SHA=$(gh api -X POST "repos/${OWNER}/${REPO}/git/commits" --input "$COMMIT_PAYLOAD" --jq '.sha')
rm -f "$COMMIT_PAYLOAD"
echo "  commit ${COMMIT_SHA:0:12}"

echo "[6/6] Creating / updating ref refs/heads/${TARGET_BRANCH}..."
# Try create first; if already exists, force-update.
if gh api "repos/${OWNER}/${REPO}/git/refs/heads/${TARGET_BRANCH}" --jq '.ref' 2>/dev/null; then
  REF_PAYLOAD=$(mktemp --suffix=.json)
  jq -n --arg sha "$COMMIT_SHA" '{sha:$sha, force:true}' > "$REF_PAYLOAD"
  gh api -X PATCH "repos/${OWNER}/${REPO}/git/refs/heads/${TARGET_BRANCH}" --input "$REF_PAYLOAD" --jq '.ref'
  rm -f "$REF_PAYLOAD"
else
  REF_PAYLOAD=$(mktemp --suffix=.json)
  jq -n --arg ref "refs/heads/${TARGET_BRANCH}" --arg sha "$COMMIT_SHA" \
    '{ref:$ref, sha:$sha}' > "$REF_PAYLOAD"
  gh api -X POST "repos/${OWNER}/${REPO}/git/refs" --input "$REF_PAYLOAD" --jq '.ref'
  rm -f "$REF_PAYLOAD"
fi

echo
echo "Done."
echo "  new branch: ${TARGET_BRANCH}"
echo "  commit:     ${COMMIT_SHA}"
