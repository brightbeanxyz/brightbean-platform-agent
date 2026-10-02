#!/usr/bin/env bash
# Upload a file with the presigned multipart flow and print its mediaAssetId.
#   bash 08_upload_media.sh ./photo.jpg
source "$(dirname "$0")/_common.sh"
need_jq
file="${1:?usage: 08_upload_media.sh <file>}"
size="$(wc -c <"$file" | tr -d ' ')"
# The file types BrightBean accepts. Anything else is refused only at `complete`, after
# every byte has been sent, so check first.
case "$(printf %s "$file" | tr "[:upper:]" "[:lower:]")" in
  *.png|*.jpg|*.jpeg|*.webp) type=image ;;
  *.gif) type=gif ;;
  *.mp4|*.mov|*.webm) type=video ;;
  *) echo "Not an accepted file type. Use .png .jpg .jpeg .webp .gif .mp4 .mov or .webm." >&2; exit 2 ;;
esac

# 1. Start.
plan="$(bb POST /media/uploads "$(jq -n --arg t "$type" --argjson s "$size" '{mediaType: $t, sizeBytes: $s}')" \
  -H "Idempotency-Key: $(new_key upload)")"
asset="$(jq -r .mediaAssetId <<<"$plan")"
part_size="$(jq -r .partSize <<<"$plan")"
parts_total="$(jq -r .partCount <<<"$plan")"
echo "asset $asset: $size bytes in $parts_total part(s)" >&2

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
urls="$(jq -c '.urls' <<<"$plan")"
etags="[]"
for ((n = 1; n <= parts_total; n++)); do
  url="$(jq -r --argjson n "$n" '.[] | select(.partNumber == $n) | .url' <<<"$urls")"
  if [[ -z "$url" ]]; then
    # 3. More URLs, up to 16 at a time (they expire after 15 minutes).
    urls="$(bb POST "/media/uploads/${asset}/parts" "{\"fromPart\": $n, \"count\": 16}" | jq -c .urls)"
    url="$(jq -r --argjson n "$n" '.[] | select(.partNumber == $n) | .url' <<<"$urls")"
  fi
  # 2. PUT this part's bytes. No Authorization header: the URL is presigned.
  dd if="$file" of="$tmp/part" bs="$part_size" skip=$((n - 1)) count=1 2>/dev/null
  etag="$(curl -sS -X PUT --data-binary @"$tmp/part" -D - -o /dev/null "$url" | tr -d '\r' | awk 'tolower($1)=="etag:" {print $2}')"
  [[ -n "$etag" ]] || { echo "part $n: no ETag (upload failed?)" >&2; exit 1; }
  etags="$(jq --argjson n "$n" --arg e "$etag" '. + [{partNumber: $n, etag: $e}]' <<<"$etags")"
  echo "  part $n/$parts_total uploaded" >&2
done

# 4. Complete.
bb POST "/media/uploads/${asset}/complete" "$(jq -n --argjson p "$etags" '{parts: $p}')" \
  | jq '{mediaAssetId: .id, mediaType, processingStatus, sizeBytes}'
