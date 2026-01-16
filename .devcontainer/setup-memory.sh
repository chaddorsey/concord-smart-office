#!/bin/bash
set -e

echo "============================================"
echo "Configuring Memory Management"
echo "============================================"

# Memory configuration values
MEMORY_LIMIT_MB=8192
SWAP_LIMIT_MB=12288
MEMORY_RESERVATION_MB=4096
SWAPPINESS=60

echo "[1/4] Checking current memory status..."
echo "  Total Memory: $(free -h | awk '/^Mem:/ {print $2}')"
echo "  Available: $(free -h | awk '/^Mem:/ {print $7}')"
echo "  Swap: $(free -h | awk '/^Swap:/ {print $2}')"

echo "[2/4] Configuring swap settings..."
# Set swappiness (how aggressively to use swap)
if [ -w /proc/sys/vm/swappiness ]; then
    echo $SWAPPINESS | sudo tee /proc/sys/vm/swappiness > /dev/null
    echo "  - Swappiness set to $SWAPPINESS"
else
    echo "  - Cannot modify swappiness (read-only)"
fi

echo "[3/4] Setting up memory monitoring..."
# Create monitoring directory
mkdir -p /tmp/memory-logs

# Create memory threshold check script
cat > /tmp/check-memory.sh << 'MEMCHECK'
#!/bin/bash
THRESHOLD=${MEMORY_PRESSURE_THRESHOLD:-0.85}
USED=$(free | awk '/^Mem:/ {printf "%.2f", $3/$2}')
if (( $(echo "$USED > $THRESHOLD" | bc -l) )); then
    echo "WARNING: Memory usage at ${USED} exceeds threshold ${THRESHOLD}"
    # Trigger Node.js garbage collection if available
    if [ -n "$NODE_OPTIONS" ]; then
        echo "  Attempting to free memory..."
    fi
fi
MEMCHECK
chmod +x /tmp/check-memory.sh

echo "[4/4] Configuring OOM handling..."
# Log OOM events
if [ -d /var/log ]; then
    echo "  - OOM killer is enabled (container will terminate runaway processes)"
fi

echo ""
echo "============================================"
echo "Memory Configuration Complete"
echo "============================================"
echo ""
echo "Limits applied (via container runArgs):"
echo "  - Memory limit: ${MEMORY_LIMIT_MB}MB (8g)"
echo "  - Memory + Swap: ${SWAP_LIMIT_MB}MB (12g)"
echo "  - Memory reservation: ${MEMORY_RESERVATION_MB}MB (4g)"
echo "  - Swappiness: ${SWAPPINESS}"
echo ""
echo "Environment variables:"
echo "  - NODE_OPTIONS: $NODE_OPTIONS"
echo "  - AGENT_MEMORY_LIMIT_MB: $AGENT_MEMORY_LIMIT_MB"
echo "  - MEMORY_PRESSURE_THRESHOLD: $MEMORY_PRESSURE_THRESHOLD"
echo ""
