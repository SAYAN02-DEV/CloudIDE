# Main Application Dockerfile
FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    git \
    bash \
    curl \
    docker-cli \
    build-base

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build Next.js application
RUN npm run build

# Expose ports
EXPOSE 3000 8080

# Create startup script
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo 'echo "🚀 Starting CloudIDE Application..."' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Start WebSocket Server in background' >> /app/start.sh && \
    echo 'echo "📡 Starting WebSocket Server on port 8080..."' >> /app/start.sh && \
    echo 'npx tsx server.ts &' >> /app/start.sh && \
    echo 'WS_PID=$!' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Wait for WebSocket server to start' >> /app/start.sh && \
    echo 'sleep 3' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Start Next.js' >> /app/start.sh && \
    echo 'echo "🌐 Starting Next.js on port 3000..."' >> /app/start.sh && \
    echo 'npm run start' >> /app/start.sh && \
    chmod +x /app/start.sh

CMD ["/app/start.sh"]
