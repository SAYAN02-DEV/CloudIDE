# ECS Fargate Quick Start Checklist

## Prerequisites ✓

- [ ] AWS Account with admin access
- [ ] AWS CLI installed and configured
- [ ] Docker installed
- [ ] Node.js and npm installed
- [ ] Existing S3 bucket created
- [ ] Existing SQS queue created
- [ ] VPC with at least 2 subnets
- [ ] Security group configured

## Installation Steps

### 1. Install Dependencies
```bash
cd cloud-ide
npm install @aws-sdk/client-ecs
```
**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

### 2. Update Environment Variables

Edit `.env` file:
```bash
# Required
USE_LOCALSTACK=false
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET_NAME=cloudide-projects
AWS_SQS_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/ACCOUNT/cloudide-terminal-queue

# ECS Configuration
ECS_CLUSTER_NAME=cloudide-cluster
ECS_TASK_DEFINITION=cloudide-worker
ECS_SUBNETS=subnet-xxx,subnet-yyy
ECS_SECURITY_GROUPS=sg-xxx
ECS_ASSIGN_PUBLIC_IP=true
ECS_MIN_TASKS=1
ECS_MAX_TASKS=10
ECS_MESSAGES_PER_TASK=5

# Redis (must be accessible from ECS)
REDIS_HOST=your-redis-host
REDIS_PORT=6379

# MongoDB (must be accessible from ECS)
MONGODB_URI=mongodb://your-uri/cloudide
```
**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

### 3. Run ECS Setup Script

```bash
chmod +x scripts/setup-ecs.sh
npm run ecs:setup
```

This creates:
- [ ] ECS Cluster
- [ ] ECR Repository
- [ ] CloudWatch Log Group
- [ ] IAM Execution Role
- [ ] IAM Task Role

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

### 4. Create AWS Secrets

```bash
# MongoDB
aws secretsmanager create-secret \
  --name cloudide/mongodb-uri \
  --secret-string "mongodb://your-uri/cloudide"

# Redis
aws secretsmanager create-secret \
  --name cloudide/redis-host \
  --secret-string "your-redis-host"

aws secretsmanager create-secret \
  --name cloudide/redis-port \
  --secret-string "6379"

# AWS Credentials
aws secretsmanager create-secret \
  --name cloudide/aws-access-key-id \
  --secret-string "your-key"

aws secretsmanager create-secret \
  --name cloudide/aws-secret-access-key \
  --secret-string "your-secret"

# S3 and SQS
aws secretsmanager create-secret \
  --name cloudide/s3-bucket-name \
  --secret-string "cloudide-projects"

aws secretsmanager create-secret \
  --name cloudide/sqs-queue-url \
  --secret-string "https://sqs.ap-south-1.amazonaws.com/ACCOUNT/cloudide-terminal-queue"
```

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

### 5. Update Task Definition

```bash
# Get your AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Update task definition
sed -i "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" ecs/task-definition.json

# Verify
cat ecs/task-definition.json | grep "image"
```

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

### 6. Build and Push Docker Image

```bash
npm run ecs:build-push
```

Or manually:
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-south-1

# Login
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin \
  $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Build
docker build -f Dockerfile.worker -t cloudide-worker:latest .

# Tag
docker tag cloudide-worker:latest \
  $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/cloudide-worker:latest

# Push
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/cloudide-worker:latest
```

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

### 7. Register Task Definition

```bash
aws ecs register-task-definition \
  --cli-input-json file://ecs/task-definition.json \
  --region ap-south-1
```

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

### 8. Configure Network Security

Ensure ECS tasks can access:

**MongoDB:**
```bash
# If using external MongoDB, allow access from ECS security group
# Or use AWS DocumentDB / MongoDB Atlas
```

**Redis:**
```bash
# If using ElastiCache
aws elasticache describe-cache-clusters --cache-cluster-id your-cluster

# Allow ECS security group to access Redis port 6379
aws ec2 authorize-security-group-ingress \
  --group-id <redis-sg> \
  --protocol tcp \
  --port 6379 \
  --source-group <ecs-sg>
```

**Internet Access:**
```bash
# Ensure subnets have internet access via NAT Gateway or IGW
# Or set ECS_ASSIGN_PUBLIC_IP=true in .env
```

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

### 9. Test Worker Locally (Optional)

```bash
# Test worker connects to AWS services
npm run ecs:test

# Should see:
# ✅ Terminal Worker initialized
# 📡 Polling SQS queue for commands...
```

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

### 10. Start ECS Orchestrator

```bash
# Development (foreground)
npm run ecs:orchestrator

# Production (with PM2)
npm install -g pm2
pm2 start "npm run ecs:orchestrator" --name cloudide-ecs-orchestrator
pm2 save
pm2 startup
```

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

## Verification Steps

### Check Running Tasks
```bash
npm run ecs:tasks

# Or
aws ecs list-tasks \
  --cluster cloudide-cluster \
  --desired-status RUNNING \
  --region ap-south-1
```
**Expected:** Should show task ARNs when queue has messages

---

### View Logs
```bash
npm run ecs:logs

# Or
aws logs tail /ecs/cloudide-worker --follow --region ap-south-1
```
**Expected:** Should see worker initialization and command processing

---

### Test Terminal Command

1. Open CloudIDE in browser
2. Create/open a project
3. Type a command in terminal: `echo "Hello from ECS!"`
4. Check logs: `npm run ecs:logs`
5. Verify output appears in terminal

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

---

## Troubleshooting

### Tasks Not Starting

**Check IAM roles:**
```bash
aws iam get-role --role-name ecsTaskExecutionRole
aws iam get-role --role-name cloudide-worker-task-role
```

**Check task definition:**
```bash
aws ecs describe-task-definition \
  --task-definition cloudide-worker \
  --region ap-south-1
```

**Check cluster:**
```bash
aws ecs describe-clusters \
  --clusters cloudide-cluster \
  --region ap-south-1
```

---

### Tasks Can't Access Redis/MongoDB

**Test connectivity from local machine:**
```bash
# Redis
redis-cli -h your-redis-host -p 6379 PING

# MongoDB
mongosh "mongodb://your-uri/cloudide"
```

**Check security groups:**
```bash
aws ec2 describe-security-groups --group-ids sg-xxx
```

---

### High Costs

**Check running tasks:**
```bash
aws ecs list-tasks --cluster cloudide-cluster --desired-status RUNNING
```

**Reduce max tasks:**
```bash
# In .env
ECS_MAX_TASKS=5  # Lower value

# Restart orchestrator
pm2 restart cloudide-ecs-orchestrator
```

---

## Quick Commands Reference

```bash
# Setup
npm run ecs:setup

# Build & Push
npm run ecs:build-push

# Start Orchestrator
npm run ecs:orchestrator

# Monitor
npm run ecs:tasks    # List tasks
npm run ecs:logs     # View logs

# Test Worker
npm run ecs:test

# AWS CLI
aws ecs list-tasks --cluster cloudide-cluster
aws ecs describe-tasks --cluster cloudide-cluster --tasks <task-arn>
aws logs tail /ecs/cloudide-worker --follow
aws ecs stop-task --cluster cloudide-cluster --task <task-arn>
```

---

## Success Criteria ✓

- [ ] ECS cluster created and active
- [ ] ECR repository contains worker image
- [ ] Task definition registered
- [ ] IAM roles configured correctly
- [ ] Secrets created in Secrets Manager
- [ ] Network security configured
- [ ] Orchestrator running and monitoring queue
- [ ] Tasks auto-scale based on queue depth
- [ ] Terminal commands execute successfully
- [ ] Output appears in browser terminal
- [ ] Logs visible in CloudWatch

---

## Next Steps

After successful setup:

1. **Monitor for 24 hours** to ensure stability
2. **Optimize costs** by adjusting ECS_MIN_TASKS and ECS_MAX_TASKS
3. **Set up alerts** in CloudWatch for task failures
4. **Configure CI/CD** to auto-deploy image updates
5. **Review security** - VPC, IAM, secrets rotation

---

## Support Resources

- **Migration Guide:** `docs/ECS_MIGRATION.md`
- **Architecture Docs:** `docs/ECS_ARCHITECTURE.md`
- **AWS ECS Docs:** https://docs.aws.amazon.com/ecs/
- **AWS Fargate Docs:** https://docs.aws.amazon.com/fargate/

---

**Installation Date:** __________

**Installed By:** __________

**Production Ready:** ☐ Yes | ☐ No

**Notes:**
```
[Add any custom notes or issues encountered]
```
