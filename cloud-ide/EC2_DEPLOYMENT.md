# CloudIDE EC2 Deployment Guide

## Quick Start (Single Command)

1. **SSH into your EC2 instance**
2. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd CloudIDE/cloud-ide
   ```

3. **Run the deployment script**
   ```bash
   chmod +x deploy-ec2.sh
   ./deploy-ec2.sh
   ```

The script will:
- Detect your EC2 public IP
- Install Docker & Docker Compose (if needed)
- Create a `.env` file with your IP
- Build and start all services
- Display access URLs

## Manual Setup

### Prerequisites

1. **EC2 Instance Requirements:**
   - Ubuntu 22.04 or Amazon Linux 2023
   - t3.medium or larger (2 vCPU, 4GB RAM minimum)
   - 20GB+ disk space
   - Ports 3000 and 8080 open in Security Group

2. **Install Docker:**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

3. **Install Docker Compose:**
   ```bash
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

4. **Logout and login again** (for Docker group changes)

### Deployment Steps

1. **Update .env file:**
   ```bash
   nano .env
   ```
   
   Update these values:
   - `NEXT_PUBLIC_WS_URL=ws://YOUR_EC2_PUBLIC_IP:8080`
   - `NEXT_PUBLIC_API_URL=http://YOUR_EC2_PUBLIC_IP:3000`
   - AWS credentials
   - Gemini API key

2. **Build and start services:**
   ```bash
   export HOST_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
   docker-compose build
   docker-compose up -d
   ```

3. **Check status:**
   ```bash
   docker-compose ps
   docker-compose logs -f app
   ```

## Service URLs

- **Frontend:** http://YOUR_EC2_IP:3000
- **WebSocket:** ws://YOUR_EC2_IP:8080
- **MongoDB:** localhost:27017 (internal only)
- **Redis:** localhost:6379 (internal only)

## Security Group Configuration

Add these inbound rules to your EC2 Security Group:

| Type        | Port | Source    | Description        |
|-------------|------|-----------|-------------------|
| Custom TCP  | 3000 | 0.0.0.0/0 | Next.js Frontend  |
| Custom TCP  | 8080 | 0.0.0.0/0 | WebSocket Server  |
| SSH         | 22   | Your IP   | SSH Access        |

## Useful Commands

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f app
docker-compose logs -f mongodb
docker-compose logs -f redis

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Check service status
docker-compose ps

# Execute commands in app container
docker-compose exec app bash
```

## Troubleshooting

### Services not starting
```bash
# Check logs
docker-compose logs app

# Check if ports are in use
sudo netstat -tulpn | grep -E '3000|8080'
```

### Database connection issues
```bash
# Check MongoDB
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"

# Check Redis
docker-compose exec redis redis-cli ping
```

### Application errors
```bash
# View real-time logs
docker-compose logs -f app

# Restart app only
docker-compose restart app
```

## Environment Variables

Key variables in `.env`:

- `CONTAINER_MODE=ecs` - Use AWS ECS for terminals
- `CONTAINER_MODE=local` - Use local Docker for terminals
- `USE_LOCALSTACK=false` - Use real AWS services
- `AWS_*` - AWS credentials and configuration
- `GEMINI_API_KEY` - Google Gemini AI API key

## Production Recommendations

1. **Use HTTPS/WSS:**
   - Set up Nginx reverse proxy with SSL
   - Get free SSL certificate from Let's Encrypt

2. **Domain Name:**
   - Point your domain to EC2 Elastic IP
   - Update environment variables with domain

3. **Monitoring:**
   ```bash
   # Install monitoring
   docker stats
   ```

4. **Backups:**
   ```bash
   # Backup MongoDB data
   docker-compose exec mongodb mongodump --out /tmp/backup
   
   # Backup volumes
   docker run --rm -v cloudide_mongodb_data:/data -v $(pwd):/backup ubuntu tar czf /backup/mongodb-backup.tar.gz /data
   ```

5. **Auto-restart:**
   - All services have `restart: unless-stopped` configured
   - They will auto-start on EC2 reboot

## Updating the Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Or use script
./deploy-ec2.sh
```

## Resource Requirements

### Minimum (Development)
- t3.medium (2 vCPU, 4GB RAM)
- 20GB disk

### Recommended (Production)
- t3.large (2 vCPU, 8GB RAM)
- 50GB disk
- Auto Scaling Group with Load Balancer

## Cost Optimization

1. **Use Spot Instances** for non-production
2. **Schedule stop/start** for development environments
3. **Monitor usage** with AWS Cost Explorer
4. **Use ECS Fargate** instead of EC2 for terminal workloads
