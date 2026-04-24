#!/bin/bash
set -euo pipefail

OWNER="fmancini-create"
REPO="HotelAccelerator"
BRANCH="signature-send-wiring"
BASE_SHA="6cdfca247e8cc454c259afe6bc5adb735191572c"

FILES=(
  "lib/email/signature.ts"
  "app/api/gmail/threads/[threadId]/reply/route.ts"
  "app/api/gmail/compose/route.ts"
  "app/api/inbox/email/send/route.ts"
  "app/api/channels/email/send-oauth/route.ts"
)

COMMIT_MESSAGE="Signature: iniezione firma rich-text in tutti gli endpoint di invio

- lib/email/signature.ts: utility centrale (getUserSignature, appendSignatureHtml, appendSignatureText)
- app/api/gmail/threads/[threadId]/reply: append firma su reply Gmail via OAuth
- app/api/gmail/compose: append firma su nuovi thread Gmail via OAuth
- app/api/inbox/email/send: append firma su SMTP send (nodemailer)
- app/api/channels/email/send-oauth: convertito a text/html per Gmail+Outlook, firma appesa

Co-authored-by: v0[bot] <v0[bot]@users.noreply.github.com>"

cd /vercel/share/v0-project

echo "[1/4] Creating blobs..."
TREE_ITEMS=""
for f in "${FILES[@]}"; do
  # Build JSON body via jq to handle arbitrary content safely (quotes, newlines, etc.)
  BODY=$(jq -n --rawfile content "$f" '{content: $content, encoding: "utf-8"}')
  SHA=$(echo "$BODY" | gh api -X POST "repos/$OWNER/$REPO/git/blobs" --input - --jq '.sha')
  echo "  blob ${SHA:0:10}  $f"
  ITEM=$(jq -n --arg p "$f" --arg s "$SHA" '{path: $p, mode: "100644", type: "blob", sha: $s}')
  if [ -z "$TREE_ITEMS" ]; then
    TREE_ITEMS="$ITEM"
  else
    TREE_ITEMS="$TREE_ITEMS,$ITEM"
  fi
done

echo "[2/4] Creating tree..."
TREE_BODY=$(jq -n --arg base "$BASE_SHA" --argjson items "[$TREE_ITEMS]" '{base_tree: $base, tree: $items}')
TREE_SHA=$(echo "$TREE_BODY" | gh api -X POST "repos/$OWNER/$REPO/git/trees" --input - --jq '.sha')
echo "  tree ${TREE_SHA:0:10}"

echo "[3/4] Creating commit..."
COMMIT_BODY=$(jq -n --arg msg "$COMMIT_MESSAGE" --arg tree "$TREE_SHA" --arg parent "$BASE_SHA" \
  '{message: $msg, tree: $tree, parents: [$parent]}')
COMMIT_SHA=$(echo "$COMMIT_BODY" | gh api -X POST "repos/$OWNER/$REPO/git/commits" --input - --jq '.sha')
echo "  commit ${COMMIT_SHA:0:10}"

echo "[4/4] Updating ref..."
REF_BODY=$(jq -n --arg sha "$COMMIT_SHA" '{sha: $sha, force: true}')
NEW_SHA=$(echo "$REF_BODY" | gh api -X PATCH "repos/$OWNER/$REPO/git/refs/heads/$BRANCH" --input - --jq '.object.sha')
echo "  ref refs/heads/$BRANCH -> ${NEW_SHA:0:10}"

echo ""
echo "Done. Commit SHA: $COMMIT_SHA"
