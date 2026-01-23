#!/bin/bash
# Concord Smart Office Backend Entrypoint
#
# Starts both the cron daemon and the Node.js application

set -e

echo "=== Concord Smart Office Backend Starting ==="

# List of environment variables to pass to cron jobs
CRON_ENV_VARS=(
    "CRON_SECRET"
    "API_URL"
    "TZ"
    "NODE_ENV"
)

# Generate cron environment file from Docker environment
echo "Generating cron environment file..."
cat > /app/cron/env.sh << 'HEADER'
#!/bin/bash
# Auto-generated cron environment
# Generated at container startup
HEADER

for var in "${CRON_ENV_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        echo "export ${var}=\"${!var}\"" >> /app/cron/env.sh
    fi
done

# Set default timezone if not specified
if [ -z "$TZ" ]; then
    echo 'export TZ="America/New_York"' >> /app/cron/env.sh
fi

# Set default API_URL for internal calls
if [ -z "$API_URL" ]; then
    echo 'export API_URL="http://localhost:3001"' >> /app/cron/env.sh
fi

echo "Cron environment configured"

# Create cron log file
touch /var/log/cron.log

# Start cron daemon
echo "Starting cron daemon..."
cron

# Verify cron is running
if pgrep cron > /dev/null; then
    echo "Cron daemon started successfully"
else
    echo "Warning: Cron daemon failed to start"
fi

# Start Node.js application (as PID 1 for proper signal handling)
echo "Starting Node.js application..."
exec node server.js
