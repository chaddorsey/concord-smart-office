#!/bin/bash
# Memory monitoring daemon for DevPod container
# Runs in background and logs memory usage, triggers cleanup at threshold

LOG_FILE="/tmp/memory-monitor.log"
CHECK_INTERVAL=${MEMORY_CHECK_INTERVAL:-30}  # seconds
THRESHOLD=${MEMORY_PRESSURE_THRESHOLD:-0.85}
CLEANUP_THRESHOLD=0.90

echo "Memory Monitor Started: $(date)" > "$LOG_FILE"
echo "Check interval: ${CHECK_INTERVAL}s" >> "$LOG_FILE"
echo "Warning threshold: ${THRESHOLD}" >> "$LOG_FILE"
echo "Cleanup threshold: ${CLEANUP_THRESHOLD}" >> "$LOG_FILE"
echo "----------------------------------------" >> "$LOG_FILE"

cleanup_memory() {
    echo "[$(date '+%H:%M:%S')] Running memory cleanup..." >> "$LOG_FILE"

    # Clear page cache, dentries and inodes (requires root)
    if [ -w /proc/sys/vm/drop_caches ]; then
        sync
        echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null 2>&1
        echo "  - Dropped caches" >> "$LOG_FILE"
    fi

    # Clear npm cache
    if command -v npm &> /dev/null; then
        npm cache clean --force > /dev/null 2>&1
        echo "  - Cleared npm cache" >> "$LOG_FILE"
    fi

    # Clear Python cache
    find /tmp -name "*.pyc" -delete 2>/dev/null
    find /tmp -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
    echo "  - Cleared Python cache" >> "$LOG_FILE"
}

while true; do
    # Get memory stats
    TOTAL=$(free -b | awk '/^Mem:/ {print $2}')
    USED=$(free -b | awk '/^Mem:/ {print $3}')
    AVAILABLE=$(free -b | awk '/^Mem:/ {print $7}')

    # Calculate percentage
    USED_PERCENT=$(echo "scale=4; $USED / $TOTAL" | bc)
    USED_PERCENT_DISPLAY=$(echo "scale=1; $USED_PERCENT * 100" | bc)

    # Human readable values
    TOTAL_MB=$(echo "$TOTAL / 1024 / 1024" | bc)
    USED_MB=$(echo "$USED / 1024 / 1024" | bc)
    AVAILABLE_MB=$(echo "$AVAILABLE / 1024 / 1024" | bc)

    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Log entry
    LOG_ENTRY="[$TIMESTAMP] Memory: ${USED_MB}MB / ${TOTAL_MB}MB (${USED_PERCENT_DISPLAY}%) | Available: ${AVAILABLE_MB}MB"

    # Check thresholds
    if (( $(echo "$USED_PERCENT > $CLEANUP_THRESHOLD" | bc -l) )); then
        echo "$LOG_ENTRY [CRITICAL - CLEANUP TRIGGERED]" >> "$LOG_FILE"
        cleanup_memory
    elif (( $(echo "$USED_PERCENT > $THRESHOLD" | bc -l) )); then
        echo "$LOG_ENTRY [WARNING]" >> "$LOG_FILE"
    else
        echo "$LOG_ENTRY" >> "$LOG_FILE"
    fi

    # Keep log file from growing too large (keep last 1000 lines)
    if [ $(wc -l < "$LOG_FILE") -gt 1000 ]; then
        tail -500 "$LOG_FILE" > "${LOG_FILE}.tmp"
        mv "${LOG_FILE}.tmp" "$LOG_FILE"
    fi

    sleep "$CHECK_INTERVAL"
done
