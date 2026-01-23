# Concord Smart Office Backend
FROM node:20-slim

# Install dependencies for better-sqlite3 and cron
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    wget \
    cron \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies and rebuild native modules
RUN npm ci && npm rebuild better-sqlite3

# Copy application code
COPY . .

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Set up cron jobs - make all scripts executable
RUN chmod +x /app/cron/*.sh && \
    chmod +x /app/cron/jobs/*.sh && \
    chmod +x /app/entrypoint.sh

# Install crontab
RUN chmod 0644 /app/cron/crontab && \
    cp /app/cron/crontab /etc/cron.d/concord-cron && \
    crontab /etc/cron.d/concord-cron

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3001/health || exit 1

# Run via entrypoint (starts cron + node)
ENTRYPOINT ["/app/entrypoint.sh"]
