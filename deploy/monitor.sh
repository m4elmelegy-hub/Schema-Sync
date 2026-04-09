#!/bin/bash
# monitor.sh — Health check every 5 minutes via crontab
# Setup: chmod +x /root/monitor.sh
#        (crontab -l 2>/dev/null; echo "*/5 * * * * /root/monitor.sh") | crontab -

API_URL="http://localhost:8080/api/healthz"
LOG_FILE="/root/monitor.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL")

if [ "$response" != "200" ]; then
  echo "[$TIMESTAMP] ❌ API DOWN (HTTP $response) — Restarting..." >> "$LOG_FILE"
  pm2 restart halaltech-api
  sleep 10

  response2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL")
  if [ "$response2" == "200" ]; then
    echo "[$TIMESTAMP] ✅ API recovered after restart" >> "$LOG_FILE"
  else
    echo "[$TIMESTAMP] 🚨 API still down after restart!" >> "$LOG_FILE"
  fi
else
  echo "[$TIMESTAMP] ✅ API healthy ($response)" >> "$LOG_FILE"
fi

# Keep last 1000 lines only
tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
