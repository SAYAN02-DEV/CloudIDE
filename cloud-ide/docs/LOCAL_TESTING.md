# Local Testing Guide for ECS Workers

This guide explains how to test the CloudIDE terminal worker system locally before deploying to AWS ECS Fargate.

## Prerequisites

- Docker installed
- Node.js 20+ installed
- Redis running locally (or via Docker)
- MongoDB running locally (or via Docker)
- LocalStack for AWS services (optional)

## Quick Start - Local Testing

### Option 1: Test Worker Without Docker (Fastest)

This runs the worker directly on your machine:

```bash
# 1. Ensure Redis and MongoDB are running
docker-compose up -d mongodb redis

# 2. Update .env for local testing
USE_LOCALSTACK=true
REDIS_HOST=localhost
REDIS_PORT=6379
MONGODB_URI=mongodb://localhost:27017/cloudide

# 3. Start LocalStack (for S3 and SQS)
docker-compose up -d localstack

# 4. In one terminal: Start Next.js + WebSocket server
npm run dev:all

# 5. In another terminal: Start the worker
npm run dev:worker

# 6. In another terminal: Start the ECS orchestrator (optional for testing)
npm run ecs:orchestrator
```

**Expected Output:**
```
🚀 Terminal Worker started, initializing SQS...
✅ SQS Service initialized with queue URL: http://localhost:4566/000000000000/cloudide-terminal-queue
📡 Polling SQS queue for commands...
```

### Option 2: Test Worker in Docker (Production-like)

This tests the actual Docker container that will run in ECS:

```bash
# 1. Build the Docker image
docker build -f Dockerfile.worker -t cloudide-worker:latest .

# 2. Run the worker container
docker run --rm \
  --network host \
  -e REDIS_HOST=localhost \
  -e REDIS_PORT=6379 \
  -e MONGODB_URI=mongodb://localhost:27017/cloudide \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=test \
  -e AWS_SECRET_ACCESS_KEY=test \
  -e AWS_S3_BUCKET_NAME=cloudide-projects \
  -e AWS_SQS_QUEUE_URL=http://localhost:4566/000000000000/cloudide-terminal-queue \
  -e USE_LOCALSTACK=true \
  cloudide-worker:latest
```

**Expected Output:**
```
✅ Terminal Worker initialized
🚀 Terminal Worker started, initializing SQS...
📡 Polling SQS queue for commands...
```

## Complete Local Stack Setup

### Step 1: Start All Services

```bash
# Start MongoDB, Redis, and LocalStack
docker-compose up -d

# Verify services are running
docker-compose ps
```

Expected output:
```
NAME                    STATUS
cloudide-localstack     Up
cloudide-mongodb        Up
cloudide-redis          Up
```

### Step 2: Configure Environment

Create or update `.env`:

```bash
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/cloudide

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# LocalStack Configuration
USE_LOCALSTACK=true

# AWS S3 Configuration (LocalStack)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_S3_BUCKET_NAME=cloudide-projects

# AWS SQS Configuration (LocalStack)
AWS_SQS_QUEUE_URL=http://localhost:4566/000000000000/cloudide-terminal-queue

# WebSocket Server
WEBSOCKET_PORT=8080

# Next.js
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NEXT_PUBLIC_API_URL=http://localhost:3000

# Security
JWT_SECRET=test-secret-key
SESSION_SECRET=test-session-key
```

### Step 3: Start Application

```bash
# Terminal 1: Next.js + WebSocket Server
npm run dev:all

# Terminal 2: Worker
npm run dev:worker

# Terminal 3: Orchestrator (optional)
npm run ecs:orchestrator
```

### Step 4: Test Terminal Commands

1. Open browser: http://localhost:3000
2. Create/open a project
3. Open terminal
4. Type a command: `echo "Hello from local worker!"`
5. Verify output appears

## Testing Checklist

### ✅ Services Running
```bash
# Check MongoDB
mongosh mongodb://localhost:27017/cloudide --eval "db.serverStatus()"

# Check Redis
redis-cli ping

# Check LocalStack
curl http://localhost:4566/_localstack/health
```

### ✅ Worker Connectivity
```bash
# Test worker can poll SQS
npm run dev:worker

# Should see:
# ✅ Terminal Worker initialized
# 📡 Polling SQS queue for commands...
```

### ✅ Command Execution
```bash
# In browser terminal, run:
echo "test"
ls -la
npm --version

# Check worker logs for:
# 📥 Processing command: echo "test"
# ✅ Command completed
```

### ✅ File Sync
```bash
# Create a file in browser
# Check it appears in S3 (LocalStack)
aws --endpoint-url=http://localhost:4566 s3 ls s3://cloudide-projects/ --recursive
```

## Testing Without LocalStack (Real AWS)

If you want to test with real AWS services:

```bash
# Update .env
USE_LOCALSTACK=false
AWS_ACCESS_KEY_ID=your-real-key
AWS_SECRET_ACCESS_KEY=your-real-secret
AWS_SQS_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/YOUR_ACCOUNT/cloudide-terminal-queue
AWS_S3_BUCKET_NAME=cloudide-projects

# Start worker
npm run dev:worker
```

## Docker Compose Full Stack

For easy local testing with all services:

```yaml
# Already in your docker-compose.yml
# Just run:
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all
docker-compose down
```

## Debugging

### Worker Not Starting

**Check logs:**
```bash
npm run dev:worker
```

**Common issues:**
- Redis not running → `docker-compose up -d redis`
- MongoDB not running → `docker-compose up -d mongodb`
- LocalStack not running → `docker-compose up -d localstack`
- Wrong environment variables → Check `.env` file

### Commands Not Executing

**Check SQS:**
```bash
# LocalStack
aws --endpoint-url=http://localhost:4566 sqs receive-message \
  --queue-url http://localhost:4566/000000000000/cloudide-terminal-queue

# Real AWS
aws sqs receive-message --queue-url YOUR_QUEUE_URL
```

**Check worker logs:**
```bash
# Look for:
# 📥 Processing command: <your-command>
# or errors
```

### Output Not Appearing in Terminal

**Check Redis pub/sub:**
```bash
redis-cli
SUBSCRIBE "terminal:*"

# Then run a command in browser
# You should see messages being published
```

**Check WebSocket server:**
```bash
# Look for:
# ✅ WebSocket server listening on port 8080
# 📡 Client connected
```

## Performance Testing

### Test Auto-Scaling Logic

```bash
# 1. Start orchestrator
npm run ecs:orchestrator

# 2. Queue multiple commands
# Use the browser or:
node -e '
const { getSQSService } = require("./lib/queue/SQSService");
const sqs = getSQSService();
sqs.initialize().then(() => {
  for(let i=0; i<10; i++) {
    sqs.sendCommand({
      projectId: "test",
      terminalId: "term1",
      userId: "user1",
      command: "sleep 5 && echo done"
    });
  }
});
'

# 3. Watch orchestrator logs
# Should see task scaling decisions
```

### Load Testing

```bash
# Send 100 commands
for i in {1..100}; do
  # Queue commands via API or SQS
  echo "Queued command $i"
done

# Monitor worker processing
npm run dev:worker
```

## Production Testing Checklist

Before deploying to ECS:

- [ ] Worker starts successfully locally
- [ ] Commands execute correctly
- [ ] Output appears in terminal UI
- [ ] Files sync to S3
- [ ] Docker build succeeds
- [ ] Docker container runs correctly
- [ ] No errors in logs
- [ ] Auto-scaling logic works (with orchestrator)
- [ ] Memory/CPU usage is acceptable
- [ ] Command timeouts work correctly

## NPM Scripts Reference

```bash
# Local Development
npm run dev              # Start Next.js
npm run ws-server        # Start WebSocket server
npm run dev:all          # Start Next.js + WebSocket
npm run dev:worker       # Start worker (local)
npm run dev:full         # Start everything locally

# ECS Testing
npm run ecs:test         # Test worker (same as dev:worker)
npm run ecs:orchestrator # Start orchestrator locally

# Docker Testing
docker build -f Dockerfile.worker -t cloudide-worker:latest .
docker run cloudide-worker:latest

# Production
npm run ecs:build-push   # Build & push to ECR
npm run ecs:setup        # Setup AWS infrastructure
```

## Tips for Local Development

### 1. Use LocalStack for AWS Services
- Avoids AWS costs during development
- Faster iteration
- No need for real AWS credentials

### 2. Use Docker Compose
- One command to start all services
- Consistent environment
- Easy cleanup

### 3. Monitor All Services
```bash
# Use tmux or screen to view all logs
tmux new-session -s cloudide
tmux split-window -h
tmux split-window -v
# npm run dev:all in pane 1
# npm run dev:worker in pane 2
# npm run ecs:orchestrator in pane 3
```

### 4. Hot Reload
- Worker automatically restarts on changes (tsx watch mode)
- Next.js has hot reload built-in

### 5. Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run dev:worker
```

## Troubleshooting Quick Fixes

```bash
# Clean everything
docker-compose down -v
npm run dev:worker

# Reset LocalStack
docker-compose restart localstack

# Reset Redis
redis-cli FLUSHALL

# Reset MongoDB
mongosh mongodb://localhost:27017/cloudide --eval "db.dropDatabase()"

# Check ports
lsof -i :3000  # Next.js
lsof -i :8080  # WebSocket
lsof -i :6379  # Redis
lsof -i :27017 # MongoDB
lsof -i :4566  # LocalStack
```

## Next Steps

After local testing succeeds:
1. ✅ Build Docker image: `npm run ecs:build-push`
2. ✅ Deploy to ECS: Follow [ECS_QUICKSTART.md](ECS_QUICKSTART.md)
3. ✅ Monitor production: `npm run ecs:logs`

---

**Quick Test Command:**
```bash
docker-compose up -d && npm run dev:all & npm run dev:worker
```

Then open http://localhost:3000 and test!
