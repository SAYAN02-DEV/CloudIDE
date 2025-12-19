# ECS Fargate Implementation

This directory contains all files needed to run CloudIDE terminal workers on AWS ECS Fargate instead of Kubernetes.

## 📁 Files Overview

### Core Implementation
- **`ECSTaskService.ts`** - Service to manage ECS Fargate tasks (launch, monitor, scale)
- **`../workers/ecs-orchestrator.ts`** - Monitors SQS queue and auto-scales tasks

### Configuration
- **`task-definition.json`** - ECS task configuration (container specs, resources, IAM roles)
- **`iam-policies.json`** - IAM role definitions for task execution and task roles

### Scripts
- **`../scripts/setup-ecs.sh`** - Automated setup script for ECS infrastructure

### Documentation
- **`../docs/ECS_MIGRATION.md`** - Complete migration guide from Kubernetes
- **`../docs/ECS_ARCHITECTURE.md`** - Architecture diagrams and explanations
- **`../docs/ECS_QUICKSTART.md`** - Step-by-step checklist
- **`../docs/KUBERNETES_VS_ECS.md`** - Detailed comparison of before/after

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install @aws-sdk/client-ecs
```

### 2. Configure Environment
Edit `.env`:
```bash
ECS_CLUSTER_NAME=cloudide-cluster
ECS_TASK_DEFINITION=cloudide-worker
ECS_SUBNETS=subnet-xxx,subnet-yyy
ECS_SECURITY_GROUPS=sg-xxx
ECS_ASSIGN_PUBLIC_IP=true
ECS_MIN_TASKS=1
ECS_MAX_TASKS=10
```

### 3. Setup AWS Infrastructure
```bash
npm run ecs:setup
```

### 4. Build & Deploy
```bash
npm run ecs:build-push
```

### 5. Start Orchestrator
```bash
npm run ecs:orchestrator
```

## 📚 Documentation

Start with these docs in order:

1. **[Quick Start Checklist](../docs/ECS_QUICKSTART.md)** - Step-by-step setup
2. **[Architecture Overview](../docs/ECS_ARCHITECTURE.md)** - How it works
3. **[Migration Guide](../docs/ECS_MIGRATION.md)** - Detailed instructions
4. **[K8s vs ECS Comparison](../docs/KUBERNETES_VS_ECS.md)** - What changed

## 🔧 NPM Scripts

```bash
npm run ecs:setup          # Setup ECS infrastructure
npm run ecs:orchestrator   # Start task orchestrator
npm run ecs:build-push     # Build & push Docker image
npm run ecs:test           # Test worker locally
npm run ecs:logs           # View CloudWatch logs
npm run ecs:tasks          # List running tasks
```

## 🏗️ Architecture

```
User Command → SQS Queue → ECS Orchestrator → ECS Fargate Tasks → S3 + Redis → User
```

**Key Components:**
1. **SQS Queue** - Stores pending commands
2. **ECS Orchestrator** - Monitors queue, scales tasks (runs on your server)
3. **ECS Fargate Tasks** - Execute commands (serverless, auto-scaled)
4. **S3** - Project file storage
5. **Redis** - Real-time output pub/sub

## 💰 Cost Optimization

- **Development:** Set `ECS_MIN_TASKS=0` → $0 when idle
- **Production:** Set `ECS_MIN_TASKS=1` → Fast response, ~$30/month
- **Scale to zero:** Tasks stop when queue is empty → No idle costs
- **Per-second billing:** Only pay when tasks are actually running

## 🔐 Security

- Secrets stored in AWS Secrets Manager
- IAM roles follow least-privilege principle
- VPC security groups restrict network access
- No hardcoded credentials

## 📊 Monitoring

```bash
# View logs in real-time
npm run ecs:logs

# Check running tasks
npm run ecs:tasks

# AWS Console
https://console.aws.amazon.com/ecs/
```

## ⚙️ Configuration Details

### Task Definition
- **CPU:** 512 (0.5 vCPU)
- **Memory:** 1024 MB (1 GB)
- **Network:** awsvpc mode
- **Logging:** CloudWatch Logs

### Auto-Scaling
- Based on SQS queue depth
- Formula: `ceil(queue_depth / messages_per_task)`
- Respects min/max task limits
- Checks every 30 seconds

## 🆘 Troubleshooting

### Tasks Not Starting
```bash
# Check IAM roles
aws iam get-role --role-name ecsTaskExecutionRole

# Check task definition
aws ecs describe-task-definition --task-definition cloudide-worker

# View stopped tasks (with reasons)
aws ecs list-tasks --cluster cloudide-cluster --desired-status STOPPED
```

### Can't Access Redis/MongoDB
```bash
# Test connectivity
redis-cli -h your-redis-host PING
mongosh "mongodb://your-uri"

# Check security groups
aws ec2 describe-security-groups --group-ids sg-xxx
```

### High Costs
```bash
# Reduce max tasks in .env
ECS_MAX_TASKS=5

# Set min to zero for dev
ECS_MIN_TASKS=0

# Check running tasks
aws ecs list-tasks --cluster cloudide-cluster
```

## 🔄 Deployment Workflow

```bash
# 1. Make code changes
vim workers/terminal-worker.ts

# 2. Build and push new image
npm run ecs:build-push

# 3. Register updated task definition
aws ecs register-task-definition --cli-input-json file://ecs/task-definition.json

# 4. Update version in .env (if needed)
ECS_TASK_DEFINITION=cloudide-worker:2

# 5. Restart orchestrator
pm2 restart cloudide-ecs-orchestrator
```

## ✅ Benefits Over Kubernetes

1. **No cluster management** - Serverless compute
2. **Better cost efficiency** - Pay per task-second
3. **Faster scaling** - Tasks start in seconds
4. **Simpler operations** - Fewer components
5. **Better AWS integration** - Native services

## 🔙 Rollback to Kubernetes

If needed:
```bash
# Stop orchestrator
pm2 stop cloudide-ecs-orchestrator

# Restore K8s config in .env
K8S_NAMESPACE=cloudide-workers

# Redeploy to K8s
npm run k8s:setup
kubectl apply -f k8s/worker-deployment.yaml
```

## 📞 Support

- **Issues:** Check CloudWatch logs and ECS task status
- **Documentation:** See `../docs/` directory
- **AWS Docs:** https://docs.aws.amazon.com/ecs/

---

**Status:** ✅ Production Ready

**Last Updated:** December 2025

**Maintained By:** CloudIDE Team
