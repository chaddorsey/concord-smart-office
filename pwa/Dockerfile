# Concord Smart Office PWA - Production Build
# Multi-stage build: Node for building, nginx for serving

# Stage 1: Build the React app
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_HA_URL=""
ARG VITE_HA_TOKEN=""

# Set environment variables for build
ENV VITE_HA_URL=$VITE_HA_URL
ENV VITE_HA_TOKEN=$VITE_HA_TOKEN

# Build the production bundle
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine AS production

# Copy custom nginx config (optional - can use default)
# COPY nginx.conf /etc/nginx/nginx.conf

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
