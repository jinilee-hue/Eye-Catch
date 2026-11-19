#!/bin/zsh
# Eye Catch — 더블클릭 실행: 로컬 서버(5261)를 띄우고 크롬으로 연다 (마이크·음성인식은 http에서만 동작).
cd "$(dirname "$0")"
PORT=5261
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html"; then
  nohup python3 tools/serve.py $PORT >/dev/null 2>&1 &          # no-cache: a reload always shows the latest files
  sleep 0.8
fi
open -a "Google Chrome" "http://127.0.0.1:$PORT/?v=$(date +%s)"
