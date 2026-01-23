#!/bin/bash
# Cron job wrapper script
# Loads environment and executes the specified job
#
# Usage: run-job.sh <job-name>

set -e

JOB_NAME="$1"

if [ -z "$JOB_NAME" ]; then
    echo "[Cron] Error: No job name specified"
    exit 1
fi

# Load environment variables
if [ -f /app/cron/env.sh ]; then
    source /app/cron/env.sh
fi

# Set timezone
export TZ="${TZ:-America/New_York}"

echo "[Cron] $(date '+%Y-%m-%d %H:%M:%S %Z') - Starting job: $JOB_NAME"

# Execute the job script
JOB_SCRIPT="/app/cron/jobs/${JOB_NAME}.sh"

if [ ! -f "$JOB_SCRIPT" ]; then
    echo "[Cron] Error: Job script not found: $JOB_SCRIPT"
    exit 1
fi

if [ ! -x "$JOB_SCRIPT" ]; then
    echo "[Cron] Error: Job script not executable: $JOB_SCRIPT"
    exit 1
fi

# Run the job
"$JOB_SCRIPT"
EXIT_CODE=$?

echo "[Cron] $(date '+%Y-%m-%d %H:%M:%S %Z') - Job $JOB_NAME finished with exit code: $EXIT_CODE"

exit $EXIT_CODE
