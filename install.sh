#!/bin/bash
# Concord Smart Office - Server Installation Script
# Run this on the Mac Pro (or Mac mini fallback) to set up the server
#
# Prerequisites:
#   - macOS with Docker Desktop installed
#   - Git (to clone this repo)
#
# Usage:
#   git clone https://github.com/your-org/concord-smart-office.git
#   cd concord-smart-office
#   ./install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/docker"

echo "========================================"
echo "Concord Smart Office - Server Setup"
echo "========================================"
echo

# Check prerequisites
check_prereqs() {
    echo "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        echo "ERROR: Docker is not installed."
        echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo "ERROR: Docker daemon is not running."
        echo "Please start Docker Desktop and try again."
        exit 1
    fi

    echo "  ✓ Docker is installed and running"
}

# Set hostname for mDNS discovery
configure_hostname() {
    echo
    echo "Configuring hostname for network discovery..."

    local current_hostname
    current_hostname=$(scutil --get LocalHostName 2>/dev/null || echo "")

    if [ "$current_hostname" = "concord-server" ]; then
        echo "  ✓ Hostname already set to concord-server"
        return
    fi

    read -p "Set hostname to 'concord-server' for network discovery? [Y/n]: " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Nn] ]]; then
        sudo scutil --set HostName concord-server
        sudo scutil --set LocalHostName concord-server
        sudo scutil --set ComputerName "Concord Server"
        echo "  ✓ Hostname set to concord-server"
        echo "    Devices can now reach this server at: concord-server.local"
    else
        echo "  ⚠ Skipped hostname configuration"
        echo "    Devices will need to use IP address instead"
    fi
}

# Configure environment
configure_env() {
    echo
    echo "Configuring environment..."

    if [ -f "$DOCKER_DIR/.env" ]; then
        echo "  Found existing .env file"
        read -p "  Overwrite with new configuration? [y/N]: " CONFIRM
        if [[ ! "$CONFIRM" =~ ^[Yy] ]]; then
            echo "  ✓ Keeping existing .env"
            return
        fi
    fi

    cp "$DOCKER_DIR/.env.example" "$DOCKER_DIR/.env"

    # Generate session secret
    SESSION_SECRET=$(openssl rand -hex 32)
    sed -i '' "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" "$DOCKER_DIR/.env"

    echo
    echo "  Please configure the following in $DOCKER_DIR/.env:"
    echo
    echo "  Required for Google OAuth (production auth):"
    echo "    GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com"
    echo "    GOOGLE_CLIENT_SECRET=your-secret"
    echo "    GOOGLE_ALLOWED_DOMAIN=yourdomain.com"
    echo
    echo "  Optional:"
    echo "    PIXABAY_API_KEY=your-key (for video browser)"
    echo
    read -p "  Press Enter to open .env in editor, or Ctrl+C to skip... "

    if command -v code &> /dev/null; then
        code "$DOCKER_DIR/.env"
    elif command -v nano &> /dev/null; then
        nano "$DOCKER_DIR/.env"
    else
        open -e "$DOCKER_DIR/.env"
    fi

    echo "  ✓ Environment configured"
}

# Build PWA
build_pwa() {
    echo
    echo "Building PWA..."

    cd "$SCRIPT_DIR/pwa"

    if [ ! -d "node_modules" ]; then
        echo "  Installing dependencies..."
        npm ci
    fi

    echo "  Building production bundle..."
    npm run build

    echo "  ✓ PWA built successfully"
    cd "$SCRIPT_DIR"
}

# Build and start Docker services
start_services() {
    echo
    echo "Building and starting Docker services..."

    cd "$DOCKER_DIR"

    # Build the PWA and copy to volume
    echo "  Building containers..."
    docker compose -f docker-compose.yml -f docker-compose.prod.yml build

    # Create PWA volume and copy dist
    echo "  Copying PWA build to Docker volume..."
    docker volume create concord-pwa-dist 2>/dev/null || true

    # Use a temporary container to copy files
    docker run --rm \
        -v "$SCRIPT_DIR/pwa/dist:/src:ro" \
        -v concord-pwa-dist:/dest \
        alpine sh -c "cp -r /src/* /dest/"

    # Start services
    echo "  Starting services..."
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

    echo "  ✓ Services started"
    cd "$SCRIPT_DIR"
}

# Verify installation
verify() {
    echo
    echo "Verifying installation..."

    local max_attempts=30
    local attempt=0

    echo "  Waiting for services to be ready..."
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost/health &>/dev/null; then
            break
        fi
        attempt=$((attempt + 1))
        sleep 2
    done

    if [ $attempt -eq $max_attempts ]; then
        echo "  ⚠ Services not responding after ${max_attempts} attempts"
        echo "  Check logs with: docker logs concord-backend"
        return 1
    fi

    echo "  ✓ Backend is healthy"

    # Check Home Assistant
    if curl -s http://localhost:8123/api/ &>/dev/null; then
        echo "  ✓ Home Assistant is running"
    else
        echo "  ⚠ Home Assistant may still be starting up"
    fi

    echo
    echo "========================================"
    echo "Installation Complete!"
    echo "========================================"
    echo
    echo "Services:"
    echo "  PWA:            http://localhost/ (or http://concord-server.local/)"
    echo "  Backend API:    http://localhost/api/"
    echo "  Home Assistant: http://localhost:8123/"
    echo
    echo "Kiosk URLs:"
    echo "  Entry 1: http://concord-server.local/kiosk/entry1"
    echo "  Entry 2: http://concord-server.local/kiosk/entry2"
    echo
    echo "Frame URLs:"
    echo "  Frame 1: http://concord-server.local/frame/1"
    echo "  Frame 2: http://concord-server.local/frame/2"
    echo "  Frame 3: http://concord-server.local/frame/3"
    echo "  Frame 4: http://concord-server.local/frame/4"
    echo
    echo "Next steps:"
    echo "  1. Open http://localhost:8123 to complete Home Assistant setup"
    echo "  2. Install HACS, SpotifyPlus, Oasis Mini integrations"
    echo "  3. Configure kiosks and frames to point to this server"
    echo
    echo "Commands:"
    echo "  View logs:    docker logs -f concord-backend"
    echo "  Stop:         cd docker && docker compose down"
    echo "  Restart:      cd docker && docker compose restart"
    echo
}

# Main
main() {
    check_prereqs
    configure_hostname
    configure_env
    build_pwa
    start_services
    verify
}

main "$@"
