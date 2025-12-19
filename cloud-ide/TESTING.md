# Quick Test Guide

## Test Locally in 3 Steps

### 1. Start Services
```bash
cd cloud-ide
docker-compose up -d
```

### 2. Start Application
```bash
# Terminal 1
npm run dev:all

# Terminal 2
npm run dev:worker
```

### 3. Test in Browser
```
1. Open: http://localhost:3000
2. Create a project
3. Open terminal
4. Type: echo "Hello from local worker!"
5. Verify output appears ✅
```

## Quick Commands

```bash
# Local testing (fastest)
npm run dev:worker

# Test Docker build
docker build -f Dockerfile.worker -t cloudide-worker .

# Test Docker run
docker run --network host \
  -e REDIS_HOST=localhost \
  -e MONGODB_URI=mongodb://localhost:27017/cloudide \
  -e AWS_ACCESS_KEY_ID=test \
  -e AWS_SECRET_ACCESS_KEY=test \
  -e USE_LOCALSTACK=true \
  cloudide-worker

# Deploy to ECS
npm run ecs:build-push
npm run ecs:orchestrator
```

## Full Documentation

- [LOCAL_TESTING.md](docs/LOCAL_TESTING.md) - Detailed local testing
- [ECS_QUICKSTART.md](docs/ECS_QUICKSTART.md) - ECS deployment
- [ECS_ARCHITECTURE.md](docs/ECS_ARCHITECTURE.md) - How it works
