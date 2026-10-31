#!/usr/bin/env bash
# Convert every PDF / image in omr/inbox/ to MusicXML with Audiveris.
# For each input <id>.<ext> it writes omr/out/<id>.mxl (when successful) and
# omr/out/<id>.json (always: status, message, log excerpt), then removes the input.
set -uo pipefail

AUDIVERIS="${AUDIVERIS:-/opt/audiveris/bin/Audiveris}"
WORK="${RUNNER_TEMP:-/tmp}/omr-work"
mkdir -p omr/out "$WORK"
shopt -s nullglob nocaseglob

count=0
for f in omr/inbox/*.pdf omr/inbox/*.png omr/inbox/*.jpg omr/inbox/*.jpeg omr/inbox/*.tif omr/inbox/*.tiff; do
  base=$(basename "$f")
  id="${base%.*}"
  out="$WORK/$id"
  rm -rf "$out" && mkdir -p "$out"
  echo "::group::Audiveris: $base"
  start=$(date +%s)
  timeout 1200 "$AUDIVERIS" -batch -transcribe -export -output "$out" -- "$f" > "$out/run.log" 2>&1
  code=$?
  tail -n 20 "$out/run.log"
  echo "::endgroup::"

  mapfile -t mxls < <(find "$out" -maxdepth 1 -name '*.mxl' | sort)
  if [ "${#mxls[@]}" -gt 0 ]; then
    cp "${mxls[0]}" "omr/out/$id.mxl"
    status=done
    msg="Converted (${#mxls[@]} movement(s); first one kept)."
    [ "${#mxls[@]}" -eq 1 ] && msg="Converted."
  else
    status=failed
    msg="Audiveris could not read music from this file (exit code $code). Clear, straight, high-resolution scans work best."
  fi
  python3 - "$id" "$status" "$msg" "$base" "$out/run.log" "$(( $(date +%s) - start ))" > "omr/out/$id.json" <<'PY'
import json, sys
id_, status, msg, src, log, secs = sys.argv[1:]
keep = ('WARN', 'ERROR', 'Exception', 'exported')
lines = [l.rstrip() for l in open(log, errors='replace') if any(k in l for k in keep)][-25:]
print(json.dumps({"id": id_, "status": status, "message": msg, "source": src, "seconds": int(secs), "log": lines}, indent=1))
PY
  echo "$base -> $status"
  rm -f "$f"
  count=$((count + 1))
done
echo "Processed $count file(s)."
