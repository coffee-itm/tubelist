#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../tests/fixtures"
CV=2.20261112.00.00
yt() { curl -sf -X POST "https://www.youtube.com/youtubei/v1/$1?prettyPrint=false" \
  -H 'Content-Type: application/json' \
  -d "{\"context\":{\"client\":{\"clientName\":\"WEB\",\"clientVersion\":\"$CV\",\"hl\":\"en\",\"gl\":\"US\"}},$2}"; }
yt player '"videoId":"dQw4w9WgXcQ"' > player-ok.json
yt player '"videoId":"aaaaaaaaaaa"' > player-unavailable.json
yt browse '"browseId":"VLPLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI"' > browse-page1.json
TOK=$(jq -r '[..|.continuationItemViewModel? // .continuationItemRenderer? // empty|..|.continuationCommand?.token? // empty][0]' browse-page1.json)
yt browse "\"continuation\":\"$TOK\"" > browse-last.json
TL=$(curl -sI 'https://www.youtube.com/watch_videos?video_ids=dQw4w9WgXcQ,9bZkp7q19f0,kJQP7kiw5Fk' | grep -oi 'list=TL[A-Za-z0-9_-]*' | cut -d= -f2)
yt next "\"playlistId\":\"$TL\"" > next-queue.json