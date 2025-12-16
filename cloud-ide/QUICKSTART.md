# Quick Start Guide - Cloud IDE

Get your Cloud IDE up and running in minutes!

## Prerequisites

Make sure you have these installed:
- Node.js 20 or higher
- Docker and Docker Compose
- MongoDB (or use Docker)
- Redis (or use Docker)

## Option 1: Local Development with Docker (Recommended)

### Step 1: Install Dependencies
```bash
cd cloud-ide
npm install
```

### Step 2: Set Up Environment
```bash
# Copy environment template
cp .env.example .env

# Edit .env file - for local dev with Docker services:
# MONGODB_URI=mongodb://localhost:27017/cloudide
# REDIS_HOST=localhost
# REDIS_PORT=6379
# For LocalStack (local AWS):
# AWS_ENDPOINT_URL=http://localhost:4566
```

### Step 3: Start Local Services
```bash
# Start MongoDB, Redis, and LocalStack
docker-compose up -d

# Wait a moment for services to start, then setup LocalStack
chmod +x scripts/setup-localstack.sh
./scripts/setup-localstack.sh
```

### Step 4: Run the Application
```bash
# Start Next.js and WebSocket server together
npm run dev:all

# Or run separately in different terminals:
# Terminal 1:
npm run dev

# Terminal 2:
npm run ws-server
```

### Step 5: Test It Out
1. Open http://localhost:3000
2. Register a new account
3. Create a project
4. Start coding collaboratively!

## Option 2: Production Setup with AWS

### Step 1: AWS Setup
```bash
# Make setup script executable
chmod +x scripts/setup-aws.sh

# Run AWS setup (creates S3 bucket and SQS queue)
./scripts/setup-aws.sh
```

### Step 2: Update .env with AWS Resources
Update your `.env` file with the actual AWS resources:
```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_actual_key
AWS_SECRET_ACCESS_KEY=your_actual_secret
AWS_S3_BUCKET_NAME=cloudide-projects
AWS_SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/...
```

### Step 3: Deploy Worker to Kubernetes
```bash
# Build worker Docker image
docker build -f Dockerfile.worker -t cloudide-worker:latest .

# Tag and push to your registry
docker tag cloudide-worker:latest your-registry/cloudide-worker:latest
docker push your-registry/cloudide-worker:latest

# Update k8s/worker-deployment.yaml with your image and secrets
# Then deploy:
kubectl create namespace cloudide-workers
kubectl apply -f k8s/worker-deployment.yaml
```

### Step 4: Run the Application
```bash
npm run build
npm start
npm run ws-server  # In another terminal
```

## Common Commands

```bash
# Development
npm run dev              # Start Next.js dev server
npm run ws-server        # Start WebSocket server
npm run dev:all          # Start both together
npm run worker           # Run terminal worker locally

# Production
npm run build            # Build for production
npm start               # Start production server

# Docker Services
docker-compose up -d     # Start all services
docker-compose down      # Stop all services
docker-compose logs -f   # View logs
```

## Testing the API

### Register a User
```bash
curl -X POST http://localhost:3000/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Login and Get Token
```bash
curl -X POST http://localhost:3000/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }'
```

Save the token from the response!

### Create a Project
```bash
curl -X POST http://localhost:3000/api/v2/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "My First Project",
    "description": "Testing Cloud IDE",
    "stack": "React",
    "language": "JavaScript"
  }'
```

## Troubleshooting

### Cannot connect to MongoDB
- Ensure MongoDB is running: `docker-compose ps`
- Check connection string in `.env`

### WebSocket connection failed
- Make sure WebSocket server is running: `npm run ws-server`
- Check `NEXT_PUBLIC_WS_URL` in `.env`

### Redis connection error
- Start Redis: `docker-compose up -d redis`
- Verify Redis is running: `redis-cli ping` (should return PONG)

### AWS S3 errors (local dev)
- Make sure LocalStack is running: `docker-compose ps`
- Run setup script: `./scripts/setup-localstack.sh`

### Terminal commands not working
- For local dev: Run the worker `npm run worker`
- For production: Check Kubernetes pods `kubectl get pods -n cloudide-workers`

## Next Steps

1. **Customize the UI**: Edit components in `app/components/`
2. **Add Features**: Extend API routes in `app/api/v2/`
3. **Configure Auto-scaling**: Adjust HPA in `k8s/worker-deployment.yaml`
4. **Set Up Monitoring**: Add logging and metrics
5. **Deploy to Production**: Set up CI/CD pipeline

## Need Help?

- Check `README.md` for detailed documentation
- Review `ARCHITECTURE.md` for system design
- Open an issue on GitHub

Happy coding! 🚀
