#!/bin/bash

# CloudIDE EC2 Deployment Script
set -e

echo "CloudIDE EC2 Deployment Setup"
echo "=================================="
echo ""

# Get EC2 public IP
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost")
echo " EC2 Public IP: $PUBLIC_IP"

# Check if .env exists
if [ ! -f .env ]; then
    echo "  .env file not found. Creating from template..."
    cat > .env << EOF
# Database Configuration
MONGODB_URI=mongodb://mongodb:27017/cloudide

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# Container Mode
USE_LOCALSTACK=false
CONTAINER_MODE=ecs

# AWS Configuration
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-access-key-here
AWS_SECRET_ACCESS_KEY=your-secret-key-here
AWS_S3_BUCKET_NAME=cloudide-projects
AWS_SQS_QUEUE_URL=your-sqs-url-here

# ECS Configuration
ECS_CLUSTER_NAME=cloudide-cluster
ECS_CONTAINER_TASK_DEFINITION=cloudide-persistent-container
ECS_TASK_SUBNETS=subnet-xxxxx,subnet-yyyyy
ECS_TASK_SECURITY_GROUPS=sg-xxxxx
ECS_TASK_ASSIGN_PUBLIC_IP=ENABLED

# WebSocket and API URLs (update with your EC2 public IP)
NEXT_PUBLIC_WS_URL=ws://${PUBLIC_IP}:8080
NEXT_PUBLIC_API_URL=http://${PUBLIC_IP}:3000

# Security
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)

# Google Gemini Configuration
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=models/gemini-2.5-flash
EOF
    echo " Created .env file. Please update AWS credentials!"
    echo ""
    echo " Edit .env file with your AWS credentials:"
    echo "   nano .env"
    echo ""
    read -p "Press Enter after updating .env file..."
fi

# Install Docker if not installed
if ! command -v docker &> /dev/null; then
    echo " Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo " Docker installed. Please logout and login again, then re-run this script."
    exit 0
fi

# Install Docker Compose if not installed
if ! command -v docker-compose &> /dev/null; then
    echo " Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo " Docker Compose installed"
fi

# Stop any existing containers
echo ""
echo "🛑 Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Build and start services
echo ""
echo "🏗️  Building application..."
HOST_IP=$PUBLIC_IP docker-compose build

echo ""
echo "Starting services..."
HOST_IP=$PUBLIC_IP docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service status
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo " Deployment Complete!"
echo ""
echo "🌐 Access your application:"
echo "   - Frontend: http://${PUBLIC_IP}:3000"
echo "   - WebSocket: ws://${PUBLIC_IP}:8080"
echo ""
echo " Useful commands:"
echo "   - View logs:     docker-compose logs -f"
echo "   - View app logs: docker-compose logs -f app"
echo "   - Stop services: docker-compose down"
echo "   - Restart:       docker-compose restart"
echo ""
echo "🔒 Security Reminder:"
echo "   - Update your EC2 security group to allow ports 3000 and 8080"
echo "   - Consider using HTTPS/WSS in production"
echo ""
