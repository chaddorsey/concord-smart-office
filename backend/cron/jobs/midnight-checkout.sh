#!/bin/bash
# Midnight Auto-Checkout Job
#
# Checks out all users who are currently checked in.
# Runs at midnight Eastern time daily.

set -e

API_URL="${API_URL:-http://localhost:3001}"
ENDPOINT="${API_URL}/api/presence/checkout-all"

if [ -z "$CRON_SECRET" ]; then
    echo "[midnight-checkout] Error: CRON_SECRET not set"
    exit 1
fi

echo "[midnight-checkout] Calling checkout-all API..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $CRON_SECRET")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "[midnight-checkout] HTTP Status: $HTTP_CODE"
echo "[midnight-checkout] Response: $BODY"

if [ "$HTTP_CODE" != "200" ]; then
    echo "[midnight-checkout] Error: API call failed"
    exit 1
fi

echo "[midnight-checkout] Checkout complete"
