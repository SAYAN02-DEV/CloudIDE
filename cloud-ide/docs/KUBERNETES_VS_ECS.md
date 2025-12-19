# Kubernetes vs ECS Fargate: Key Changes

## Quick Summary

Your CloudIDE terminal worker system has been migrated from **Kubernetes pods** to **AWS ECS Fargate tasks**. The application code remains unchanged - only the infrastructure and orchestration layer has changed.

## What Changed

### Infrastructure

| Component | Before (Kubernetes) | After (ECS Fargate) |
|-----------|-------------------|-------------------|
| **Orchestration** | Kubernetes cluster | ECS cluster (serverless) |
| **Workers** | Pods | Fargate tasks |
| **Scaling** | Horizontal Pod Autoscaler (HPA) | Custom orchestrator |
| **Image Registry** | Minikube local or Docker Hub | AWS ECR |
| **Configuration** | ConfigMaps + Secrets | Environment variables + Secrets Manager |
| **Networking** | ClusterIP services | VPC + Security Groups |
| **Monitoring** | kubectl logs | CloudWatch Logs |
| **Deployment** | kubectl apply | AWS CLI / ECS Console |

### Files Added

```
cloud-ide/
├── lib/
│   └── ecs/
│       └── ECSTaskService.ts          # NEW: ECS task management
├── workers/
│   └── ecs-orchestrator.ts            # NEW: Auto-scaling orchestrator
├── ecs/
│   ├── task-definition.json           # NEW: ECS task configuration
│   └── iam-policies.json              # NEW: IAM role definitions
├── scripts/
│   └── setup-ecs.sh                   # NEW: ECS setup script
└── docs/
    ├── ECS_MIGRATION.md               # NEW: Migration guide
    ├── ECS_ARCHITECTURE.md            # NEW: Architecture documentation
    └── ECS_QUICKSTART.md              # NEW: Quick start checklist
```

### Files Modified

```
cloud-ide/
├── .env                               # MODIFIED: Added ECS config vars
└── package.json                       # MODIFIED: Added ECS scripts + dependency
```

### Files Unchanged

```
cloud-ide/
├── workers/
│   └── terminal-worker.ts             # NO CHANGES
├── lib/
│   ├── storage/S3Service.ts           # NO CHANGES
│   ├── queue/SQSService.ts            # NO CHANGES
│   └── terminal/
│       ├── TerminalWorker.ts          # NO CHANGES
│       └── SQSTerminalService.ts      # NO CHANGES
├── server.ts                          # NO CHANGES
└── lib/websocket/WebSocketServer.ts   # NO CHANGES
```

## Command Changes

### Development

| Task | Before (K8s) | After (ECS) |
|------|-------------|------------|
| **Setup** | `npm run k8s:setup` | `npm run ecs:setup` |
| **Build Image** | `docker build + minikube image load` | `npm run ecs:build-push` |
| **Deploy** | `kubectl apply -f k8s/` | Automatic via orchestrator |
| **View Logs** | `npm run k8s:logs` | `npm run ecs:logs` |
| **Check Status** | `npm run k8s:status` | `npm run ecs:tasks` |
| **Test Worker** | `npm run dev:worker` | `npm run ecs:test` |

### New Commands

```bash
# Start the orchestrator (replaces K8s HPA)
npm run ecs:orchestrator

# Build and push to ECR
npm run ecs:build-push

# List running tasks
npm run ecs:tasks

# View CloudWatch logs
npm run ecs:logs
```

## Configuration Changes

### Environment Variables

**Removed:**
```bash
K8S_NAMESPACE=cloudide-workers
K8S_WORKER_IMAGE=cloudide-worker:latest
K8S_MIN_REPLICAS=1
K8S_MAX_REPLICAS=10
```

**Added:**
```bash
ECS_CLUSTER_NAME=cloudide-cluster
ECS_TASK_DEFINITION=cloudide-worker
ECS_SUBNETS=subnet-xxx,subnet-yyy
ECS_SECURITY_GROUPS=sg-xxx
ECS_ASSIGN_PUBLIC_IP=true
ECS_MIN_TASKS=1
ECS_MAX_TASKS=10
ECS_MESSAGES_PER_TASK=5
```

### Secrets Management

**Before (K8s):**
- Stored in Kubernetes Secrets
- Applied via `kubectl apply`
- Base64 encoded

**After (ECS):**
- Stored in AWS Secrets Manager
- Referenced in task definition
- Encrypted at rest and in transit
- Easier rotation

## Architecture Changes

### Scaling Mechanism

**Before (K8s HPA):**
```yaml
# Automatic scaling based on CPU/Memory
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 1
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        averageUtilization: 70
```

**After (ECS Orchestrator):**
```typescript
// Custom scaling based on SQS queue depth
const queueDepth = await getQueueDepth();
const desiredTasks = Math.ceil(queueDepth / messagesPerTask);
await ecsService.launchWorkerTask(desiredTasks);
```

### Worker Lifecycle

**Before (K8s Pod):**
1. K8s schedules pod on node
2. Pod starts and runs continuously
3. HPA scales based on CPU/memory
4. Pod stays running even if idle

**After (ECS Fargate Task):**
1. Orchestrator launches task in Fargate
2. Task starts in seconds (no node provisioning)
3. Orchestrator scales based on queue depth
4. Task can exit when no work (saves costs)

## Network Changes

### Before (Kubernetes)

```yaml
# Access via ClusterIP
apiVersion: v1
kind: Service
metadata:
  name: redis-service
spec:
  type: ClusterIP
  ports:
  - port: 6379
```

- Services discovered via DNS
- Internal cluster networking
- Isolated from host network

### After (ECS Fargate)

```json
{
  "networkMode": "awsvpc",
  "networkConfiguration": {
    "awsvpcConfiguration": {
      "subnets": ["subnet-xxx"],
      "securityGroups": ["sg-xxx"],
      "assignPublicIp": "ENABLED"
    }
  }
}
```

- Tasks get their own ENI (Elastic Network Interface)
- Direct VPC networking
- Security groups for access control
- Redis/MongoDB must be accessible from VPC

## Cost Comparison

### Kubernetes (Minikube/EKS)

**Minikube (Local):**
- Free, but requires local resources
- Always running (CPU/memory consumed)

**EKS (Production):**
- **Control plane:** $0.10/hour = $73/month
- **Worker nodes:** t3.medium × 2 = ~$60/month
- **Total:** ~$133/month minimum
- Always running, even if idle

### ECS Fargate

**Pricing:**
- **No control plane costs**
- **Pay per task:** $0.04/hour per task (512 CPU, 1GB)
- **Scales to zero:** $0 when no tasks running

**Example Scenarios:**

| Scenario | Tasks | Hours/Day | Daily Cost | Monthly Cost |
|----------|-------|-----------|------------|--------------|
| Dev (idle) | 0 | 0 | $0 | $0 |
| Low traffic | 1-2 | 8 | $0.64 | $19 |
| Medium traffic | 2-5 | 16 | $3.20 | $96 |
| High traffic | 5-10 | 24 | $9.60 | $288 |

**Cost Savings:**
- 0-85% cheaper for low/medium traffic
- No idle costs during development
- More expensive only at very high sustained load

## Operational Changes

### Deployment Process

**Before (K8s):**
```bash
# Build image
docker build -f Dockerfile.worker -t cloudide-worker .

# Load into Minikube
minikube image load cloudide-worker:latest

# Apply manifests
kubectl apply -f k8s/worker-deployment.yaml

# Check rollout
kubectl rollout status deployment/cloudide-terminal-worker
```

**After (ECS):**
```bash
# Build and push to ECR
npm run ecs:build-push

# Register new task definition (auto-increments version)
aws ecs register-task-definition --cli-input-json file://ecs/task-definition.json

# Update .env with new version
ECS_TASK_DEFINITION=cloudide-worker:2

# Restart orchestrator
pm2 restart cloudide-ecs-orchestrator

# New tasks automatically use latest version
```

### Monitoring

**Before (K8s):**
```bash
kubectl get pods -n cloudide-workers
kubectl logs -f pod-name
kubectl describe pod pod-name
kubectl top pods
```

**After (ECS):**
```bash
aws ecs list-tasks --cluster cloudide-cluster
npm run ecs:logs
aws ecs describe-tasks --cluster cloudide-cluster --tasks task-arn
# CloudWatch metrics in AWS Console
```

## Benefits of Migration

### ✅ Advantages of ECS Fargate

1. **No Cluster Management**
   - No need to manage Kubernetes control plane
   - No worker node provisioning
   - No cluster upgrades

2. **Better Cost Efficiency**
   - Pay only when tasks run
   - Scale to zero during idle periods
   - No minimum infrastructure costs

3. **Faster Scaling**
   - Tasks start in seconds
   - No node capacity planning
   - Immediate response to load

4. **Simpler Operations**
   - Fewer moving parts
   - Standard AWS tools
   - Better AWS service integration

5. **Better Isolation**
   - Each task in its own environment
   - No resource contention
   - Enhanced security

### ⚠️ Considerations

1. **Cold Start**
   - First task takes 30-60 seconds to start
   - Mitigated by keeping ECS_MIN_TASKS >= 1

2. **Custom Orchestrator**
   - Need to run orchestrator service
   - Additional component to monitor
   - Could be replaced with AWS Lambda + EventBridge later

3. **Networking**
   - Redis/MongoDB must be accessible from VPC
   - Requires proper security group configuration
   - May need NAT Gateway or public IPs

4. **AWS Lock-in**
   - More dependent on AWS services
   - Migration back to K8s requires effort
   - But gains AWS ecosystem benefits

## Migration Checklist

- [ ] Install `@aws-sdk/client-ecs` dependency
- [ ] Update `.env` with ECS configuration
- [ ] Run `npm run ecs:setup`
- [ ] Create AWS Secrets Manager secrets
- [ ] Update task definition with account ID
- [ ] Build and push Docker image to ECR
- [ ] Register task definition
- [ ] Configure VPC networking
- [ ] Start ECS orchestrator
- [ ] Test terminal commands
- [ ] Monitor CloudWatch logs
- [ ] Verify auto-scaling works
- [ ] Update documentation
- [ ] Train team on new commands
- [ ] Decommission K8s cluster (if no longer needed)

## Rollback Plan

If you need to rollback to Kubernetes:

1. **Stop ECS orchestrator:**
   ```bash
   pm2 stop cloudide-ecs-orchestrator
   ```

2. **Restore K8s config in `.env`:**
   ```bash
   K8S_NAMESPACE=cloudide-workers
   K8S_WORKER_IMAGE=cloudide-worker:latest
   ```

3. **Redeploy to K8s:**
   ```bash
   npm run k8s:setup
   kubectl apply -f k8s/worker-deployment.yaml
   ```

4. **Verify K8s pods are running:**
   ```bash
   npm run k8s:status
   ```

## Summary

The migration from Kubernetes to ECS Fargate is a **infrastructure change only**. Your application code (`terminal-worker.ts`, S3Service, SQSService, etc.) remains completely unchanged. The main differences are:

- **How workers are launched:** K8s pods → ECS Fargate tasks
- **How scaling works:** K8s HPA → Custom orchestrator
- **Where images are stored:** Minikube/local → AWS ECR
- **How you deploy:** kubectl → AWS CLI
- **Cost model:** Fixed → Pay-per-use

The end result is a more cost-effective, scalable, and manageable solution with the same functionality.
