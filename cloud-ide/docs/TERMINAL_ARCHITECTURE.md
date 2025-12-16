# Terminal Worker Architecture

## Overview

The CloudIDE terminal uses a **queue-based architecture** with Kubernetes workers for scalability and isolation.

## Architecture Flow

```
User Types Command
    ↓
WebSocket Server
    ↓
SQS Queue (AWS SQS / LocalStack)
    ↓
Kubernetes Worker Pod:
  1. Pull command from SQS
  2. Download project files from S3 (CRDT format)
  3. Convert CRDT → actual files in pod filesystem
  4. Execute command in isolated environment
  5. Send output via Redis Pub/Sub
    ↓
WebSocket Server (subscribes to Redis)
    ↓
User Sees Output
```

## Local Development (No Kubernetes)

For quick local testing without Kubernetes:

```bash
# Terminal 1: Start Next.js + WebSocket
npm run dev:all

# Terminal 2: Start Worker (processes SQS locally)
npm run dev:worker
```

The worker will:
- Poll LocalStack SQS queue
- Download files from LocalStack S3
- Execute commands locally
- Send output via Redis

## Local Development (With Kubernetes)

### 1. Install Minikube

```bash
# Install Minikube
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# Start Minikube
minikube start --driver=docker --cpus=4 --memory=4096
```

### 2. Deploy Workers

```bash
# One command setup
npm run k8s:setup

# Or manually:
docker build -t cloudide-worker:latest -f Dockerfile.worker .
minikube image load cloudide-worker:latest
kubectl apply -f k8s/local-config.yaml
kubectl apply -f k8s/terminal-worker-deployment.yaml
```

### 3. Monitor

```bash
# View worker pods
npm run k8s:status

# Stream logs
npm run k8s:logs

# Watch auto-scaling
kubectl get hpa -n cloudide-workers -w
```

## Production Deployment (AWS)

### 1. Prerequisites

- EKS Cluster
- SQS Queue: `cloudide-terminal-queue`
- S3 Bucket: `cloudide-projects`
- Redis (ElastiCache or self-hosted)

### 2. Update Config

Edit `k8s/config.yaml`:

```yaml
data:
  sqs-queue-url: "https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT_ID/cloudide-terminal-queue"
  s3-bucket-name: "cloudide-projects"
  redis-host: "your-redis.cache.amazonaws.com"
  redis-port: "6379"
```

Add AWS credentials:

```yaml
stringData:
  access-key-id: "YOUR_ACTUAL_ACCESS_KEY"
  secret-access-key: "YOUR_ACTUAL_SECRET_KEY"
```

### 3. Deploy to EKS

```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
docker build -t cloudide-worker:latest -f Dockerfile.worker .
docker tag cloudide-worker:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/cloudide-worker:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/cloudide-worker:latest

# Update deployment image
# Edit k8s/terminal-worker-deployment.yaml, change image to ECR URL

# Deploy
kubectl apply -f k8s/config.yaml
kubectl apply -f k8s/terminal-worker-deployment.yaml
```

### 4. Auto-Scaling (AWS)

The HPA (Horizontal Pod Autoscaler) is configured to:
- **Min replicas:** 2
- **Max replicas:** 10
- **Scale up** when CPU > 70% or Memory > 80%
- **Scale down** gradually (50% every 60s)

For production, you can also use **Cluster Autoscaler** or **Karpenter** to scale nodes automatically.

## How It Works

### 1. Command Submission

```typescript
// User types "ls -la"
socket.emit('terminal-command', {
  projectId: '123',
  terminalId: 'term-1',
  command: 'ls -la'
});
```

### 2. WebSocket → SQS

```typescript
// WebSocket server
sqsService.sendCommand({
  projectId: '123',
  terminalId: 'term-1',
  userId: 'user-1',
  username: 'john',
  command: 'ls -la',
  timestamp: Date.now()
});
```

### 3. Worker Processes

```typescript
// Worker pod
1. Receive from SQS
2. Download files: s3://cloudide-projects/crdt/123/*.yjs
3. Convert CRDT → text files in /tmp/cloudide-workspaces/123/
4. Execute: spawn('ls -la', { cwd: '/tmp/cloudide-workspaces/123' })
5. Publish output to Redis: terminal:123:term-1
6. Delete SQS message
```

### 4. Output Delivery

```typescript
// WebSocket server subscribes to Redis
redisSub.on('message', (channel, message) => {
  io.to(`terminal:${projectId}:${terminalId}`).emit('terminal-output', {
    terminalId,
    output: message
  });
});
```

## Security Considerations

1. **Isolation:** Each command runs in a separate workspace directory
2. **Timeouts:** Commands timeout after 30 seconds
3. **Resource Limits:** Kubernetes limits CPU/memory per pod
4. **No persistence:** Workspace cleaned up after command execution
5. **IAM Roles:** Use AWS IAM roles for pods (not hardcoded credentials)

## Monitoring

```bash
# CloudWatch Metrics (Production)
- SQS Queue Depth
- Worker Pod CPU/Memory
- Command Execution Time
- Error Rate

# Local Monitoring
kubectl top pods -n cloudide-workers
kubectl get hpa -n cloudide-workers
```

## Troubleshooting

**Worker not processing commands:**
```bash
kubectl logs -f -l app=terminal-worker -n cloudide-workers
```

**SQS queue building up:**
```bash
# Scale manually
kubectl scale deployment terminal-worker --replicas=5 -n cloudide-workers
```

**Commands timing out:**
- Increase timeout in `workers/terminal-worker.ts`
- Check worker pod resources

## Cost Optimization

1. Use **Spot Instances** for worker nodes (EKS)
2. Set appropriate **HPA thresholds** to avoid over-provisioning
3. Use **SQS Dead Letter Queue** for failed commands
4. Monitor and adjust min/max replicas based on usage patterns
