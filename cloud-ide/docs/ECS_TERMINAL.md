# ECS-Based Terminal System

## Overview

The CloudIDE now uses **AWS ECS Fargate** to run isolated terminal sessions. Each terminal spawns a dedicated, secure Fargate task with:

✅ **Complete Isolation** - Each user gets their own container  
✅ **No Host Access** - Cannot access the server's filesystem  
✅ **Resource Limits** - 512MB RAM, 0.5 vCPU per terminal  
✅ **Auto-scaling** - ECS handles scaling automatically  
✅ **S3 Integration** - Files sync to/from S3 automatically  
✅ **Secure** - No sudo, no privileged access  

## Architecture

```
User Terminal Request
    ↓
WebSocket Server
    ↓
ECS Terminal Service
    ↓
Launch Fargate Task (isolated container)
    ↓
ECS Exec (interactive shell via AWS SSM)
    ↓
User sees terminal output
```

## Setup

### 1. Prerequisites

- AWS Account with ECS permissions
- AWS CLI configured
- Docker installed
- VPC with public subnets
- Security group allowing outbound traffic

### 2. Run Setup Script

```bash
npm run ecs:terminal-setup
```

This will:
- Create ECR repository for terminal image
- Build and push Docker image
- Create IAM roles with proper permissions
- Register ECS task definition
- Create CloudWatch log group
- Setup ECS cluster

### 3. Configure Environment Variables

Add to your `.env` file:

```env
# ECS Terminal Configuration
ECS_CLUSTER_NAME=cloudide-cluster
ECS_TASK_DEFINITION=cloudide-terminal-task
ECS_SUBNETS=subnet-xxxxx,subnet-yyyyy
ECS_SECURITY_GROUPS=sg-zzzzz
AWS_REGION=us-east-1

# AWS Credentials
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=cloudide-projects
```

### 4. Start the Server

```bash
npm run dev:all
```

## How It Works

### Terminal Lifecycle

1. **User opens terminal** → WebSocket receives `terminal-init` event
2. **ECS launches task** → Fargate spins up isolated container
3. **Container downloads project** → Files pulled from S3
4. **ECS Exec connects** → Interactive shell via AWS Session Manager
5. **User types commands** → Executed in isolated container
6. **Files auto-sync** → Changes uploaded to S3
7. **User closes terminal** → Task stops, container destroyed

### Security Features

- **No privileged mode** - Containers run as non-root user (UID 1000)
- **No network access** - Network mode disabled by default
- **Resource quotas** - CPU and memory limits enforced
- **Read-only root** - Base filesystem is immutable
- **Workspace only** - Only `/workspace` is writable
- **S3 permissions** - Limited to specific bucket/prefix
- **Auto-cleanup** - Containers removed after session ends

### Cost Optimization

- **Pay-per-use** - Only charged when terminals are active
- **Auto-termination** - Tasks stop when users disconnect
- **Small tasks** - 0.5 vCPU, 512MB RAM per terminal
- **Spot instances** - Can use Fargate Spot for 70% savings (future)

## Monitoring

### View Running Terminals

```bash
npm run ecs:tasks
```

### View Terminal Logs

```bash
npm run ecs:terminal-logs
```

### Check Specific Terminal

```bash
aws ecs describe-tasks \
  --cluster cloudide-cluster \
  --tasks <task-arn>
```

## Development vs Production

### Local Development
- Use LocalStack ECS emulator (optional)
- Or skip ECS and use Docker directly (less secure)

### Production
- Full ECS Fargate deployment
- Auto-scaling based on demand
- CloudWatch monitoring
- VPC security groups
- IAM role-based permissions

## Troubleshooting

### Task fails to start
- Check security group allows outbound traffic
- Verify subnet has internet access (NAT gateway)
- Check IAM roles have correct permissions

### Cannot connect to terminal
- Ensure ECS Exec is enabled on cluster
- Verify task role has SSM permissions
- Check CloudWatch logs for errors

### Files not syncing
- Verify S3 bucket exists and is accessible
- Check task role has S3 permissions
- Review entrypoint.sh logs in CloudWatch

## Future Enhancements

- [ ] Support for multiple container images (Python, Node, etc.)
- [ ] Custom resource limits per user tier
- [ ] Terminal sharing for collaboration
- [ ] Terminal history/recording
- [ ] Integration with VS Code Server
- [ ] GPU-enabled containers for ML workloads
