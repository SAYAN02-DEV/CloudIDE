# Migration Guide: Kubernetes to ECS Fargate

## Overview

This guide explains how to migrate from Kubernetes pods to AWS ECS Fargate tasks for the CloudIDE terminal worker system.

## Architecture Change

### Before (Kubernetes)
```
User Command → SQS Queue → Kubernetes Worker Pods → S3 → Execute → Redis Pub/Sub → User
```

### After (ECS Fargate)
```
User Command → SQS Queue → ECS Fargate Tasks → S3 → Execute → Redis Pub/Sub → User
```

**Key Changes:**
- Kubernetes pods replaced with ECS Fargate tasks
- Kubernetes HPA replaced with custom ECS task orchestrator
- No changes to application code (workers remain the same)
- Auto-scaling based on SQS queue depth

## Prerequisites

1. AWS Account with ECS and Fargate access
2. AWS CLI configured
3. Docker installed
4. VPC with subnets and security groups configured
5. Existing S3 bucket and SQS queue

## Migration Steps

### Step 1: Install Dependencies

```bash
cd cloud-ide
npm install @aws-sdk/client-ecs
```

### Step 2: Update Environment Variables

Update your `.env` file:

```bash
# Disable LocalStack (use real AWS)
USE_LOCALSTACK=false

# AWS Configuration
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET_NAME=cloudide-projects
AWS_SQS_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/YOUR_ACCOUNT/cloudide-terminal-queue

# ECS Fargate Configuration
ECS_CLUSTER_NAME=cloudide-cluster
ECS_TASK_DEFINITION=cloudide-worker
ECS_SUBNETS=subnet-xxxxx,subnet-yyyyy
ECS_SECURITY_GROUPS=sg-xxxxxxxxx
ECS_ASSIGN_PUBLIC_IP=true
ECS_MIN_TASKS=1
ECS_MAX_TASKS=10
ECS_MESSAGES_PER_TASK=5

# Redis Configuration (must be accessible from ECS tasks)
REDIS_HOST=your-redis-host
REDIS_PORT=6379

# MongoDB Configuration (must be accessible from ECS tasks)
MONGODB_URI=mongodb://your-mongodb-uri/cloudide
```

### Step 3: Setup AWS Infrastructure

Run the setup script to create all necessary AWS resources:

```bash
npm run ecs:setup
```

This will create:
- ECS Cluster
- ECR Repository
- CloudWatch Log Group
- IAM Roles (Task Execution Role and Task Role)

### Step 4: Update Task Definition

Edit `ecs/task-definition.json` with your actual AWS account ID:

```bash
# The setup script does this automatically, but verify:
sed -i "s/YOUR_ACCOUNT_ID/$(aws sts get-caller-identity --query Account --output text)/g" ecs/task-definition.json
```

### Step 5: Create AWS Secrets

Create secrets in AWS Secrets Manager for sensitive configuration:

```bash
# MongoDB URI
aws secretsmanager create-secret \
  --name cloudide/mongodb-uri \
  --secret-string "mongodb://your-mongodb-uri/cloudide"

# Redis Host
aws secretsmanager create-secret \
  --name cloudide/redis-host \
  --secret-string "your-redis-host"

# Redis Port
aws secretsmanager create-secret \
  --name cloudide/redis-port \
  --secret-string "6379"

# AWS Access Key
aws secretsmanager create-secret \
  --name cloudide/aws-access-key-id \
  --secret-string "your-access-key"

# AWS Secret Key
aws secretsmanager create-secret \
  --name cloudide/aws-secret-access-key \
  --secret-string "your-secret-key"

# S3 Bucket
aws secretsmanager create-secret \
  --name cloudide/s3-bucket-name \
  --secret-string "cloudide-projects"

# SQS Queue URL
aws secretsmanager create-secret \
  --name cloudide/sqs-queue-url \
  --secret-string "https://sqs.ap-south-1.amazonaws.com/YOUR_ACCOUNT/cloudide-terminal-queue"
```

### Step 6: Setup Network Access

**Important:** Ensure your ECS tasks can access:
1. **MongoDB** - Either use AWS DocumentDB, MongoDB Atlas, or make your MongoDB accessible
2. **Redis** - Either use AWS ElastiCache or make your Redis accessible
3. **Internet** - For pulling Docker images and accessing AWS services

Update security group rules:
```bash
# Allow Redis access (port 6379)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 6379 \
  --source-group sg-xxxxxxxxx

# Allow outbound internet access (usually already enabled)
```

### Step 7: Build and Push Docker Image

```bash
npm run ecs:build-push
```

Or manually:
```bash
# Login to ECR
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  YOUR_ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com

# Build
docker build -f Dockerfile.worker -t cloudide-worker:latest .

# Tag
docker tag cloudide-worker:latest \
  YOUR_ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com/cloudide-worker:latest

# Push
docker push YOUR_ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com/cloudide-worker:latest
```

### Step 8: Register Task Definition

```bash
aws ecs register-task-definition \
  --cli-input-json file://ecs/task-definition.json
```

### Step 9: Start the ECS Orchestrator

The orchestrator monitors the SQS queue and auto-scales ECS tasks:

```bash
# In production (background process)
npm run ecs:orchestrator &

# Or with PM2
pm2 start "npm run ecs:orchestrator" --name cloudide-ecs-orchestrator
```

### Step 10: Test the Setup

```bash
# Check running tasks
npm run ecs:tasks

# View logs
npm run ecs:logs

# Test a single worker locally
npm run ecs:test
```

## New NPM Scripts

```bash
# Setup ECS infrastructure
npm run ecs:setup

# Start the ECS task orchestrator (auto-scaling)
npm run ecs:orchestrator

# Build and push Docker image to ECR
npm run ecs:build-push

# Test worker locally
npm run ecs:test

# View ECS task logs
npm run ecs:logs

# List running tasks
npm run ecs:tasks
```

## Architecture Components

### 1. ECS Task Service (`lib/ecs/ECSTaskService.ts`)
- Manages ECS Fargate task lifecycle
- Launches tasks on-demand
- Monitors running tasks
- Implements auto-scaling logic

### 2. ECS Orchestrator (`workers/ecs-orchestrator.ts`)
- Monitors SQS queue depth
- Automatically scales tasks up/down
- Runs as a background service

### 3. Terminal Worker (`workers/terminal-worker.ts`)
- **No changes required!**
- Runs the same in ECS as it did in K8s
- Polls SQS, executes commands, publishes to Redis

## Cost Optimization

### Fargate Pricing
- **512 CPU, 1GB Memory**: ~$0.04/hour per task
- Tasks auto-scale based on queue depth
- Tasks stop when no work is available

### Tips
1. Set `ECS_MIN_TASKS=0` for development (no idle costs)
2. Set `ECS_MIN_TASKS=1` for production (better response time)
3. Adjust `ECS_MESSAGES_PER_TASK` based on average command duration
4. Use Fargate Spot for up to 70% savings (add in task definition)

## Monitoring

### CloudWatch Logs
```bash
# Tail logs
aws logs tail /ecs/cloudide-worker --follow

# View specific task logs
aws logs get-log-events \
  --log-group-name /ecs/cloudide-worker \
  --log-stream-name ecs/cloudide-worker/TASK_ID
```

### ECS Console
- View running tasks: https://console.aws.amazon.com/ecs/
- Check task health and status
- View CloudWatch metrics

### Metrics to Monitor
- SQS queue depth
- Number of running tasks
- Task CPU/Memory utilization
- Task failures

## Troubleshooting

### Tasks Not Starting
1. Check IAM roles have correct permissions
2. Verify secrets exist in Secrets Manager
3. Check VPC/subnet/security group configuration
4. Review CloudWatch logs for errors

### Tasks Can't Access Redis/MongoDB
1. Verify security group rules
2. Check network ACLs
3. Ensure `ECS_ASSIGN_PUBLIC_IP=true` if using public endpoints
4. Consider using VPC endpoints for AWS services

### High Costs
1. Reduce `ECS_MAX_TASKS`
2. Set `ECS_MIN_TASKS=0` for dev environments
3. Optimize task CPU/memory allocation
4. Use Fargate Spot

### Tasks Not Auto-Scaling
1. Verify orchestrator is running: `ps aux | grep ecs-orchestrator`
2. Check orchestrator logs
3. Verify SQS queue URL is correct
4. Check AWS credentials have ECS permissions

## Rollback to Kubernetes

If needed, you can rollback:

```bash
# Restore old K8s configuration in .env
# Redeploy to Kubernetes
npm run k8s:setup
kubectl apply -f k8s/worker-deployment.yaml
```

## Benefits of ECS Fargate

✅ **No cluster management** - AWS manages infrastructure
✅ **Better isolation** - Each task runs in its own environment
✅ **Pay per use** - Only pay when tasks are running
✅ **Faster scaling** - Tasks start in seconds
✅ **Built-in monitoring** - CloudWatch integration
✅ **Simpler deployment** - No kubectl required

## Support

For issues or questions:
1. Check CloudWatch logs
2. Review ECS task status in AWS Console
3. Verify all environment variables are set correctly
4. Ensure VPC networking is configured properly
