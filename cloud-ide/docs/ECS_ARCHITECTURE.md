# ECS Fargate Architecture for CloudIDE Terminal Workers

## System Flow

```
┌─────────────┐
│   Browser   │
│   (User)    │
└──────┬──────┘
       │ Execute command
       ▼
┌─────────────┐
│  Next.js    │
│   Server    │
└──────┬──────┘
       │ Queue command
       ▼
┌─────────────────────────────────────────────┐
│           AWS SQS Queue                     │
│  (cloudide-terminal-queue)                  │
└──────┬──────────────────────────────────────┘
       │
       │ ┌────────────────────────────────┐
       │ │  ECS Task Orchestrator         │
       │ │  - Monitors queue depth        │
       │ │  - Auto-scales tasks           │
       │ │  - Runs on your server         │
       │ └────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│        AWS ECS Fargate                      │
│  ┌──────────────────────────────────────┐   │
│  │  Task 1: cloudide-worker             │   │
│  │  - Polls SQS                         │   │
│  │  - Downloads project from S3         │   │
│  │  - Executes command                  │   │
│  │  - Publishes output to Redis         │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  Task 2: cloudide-worker             │   │
│  │  (Auto-scaled based on queue depth)  │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  Task N: cloudide-worker             │   │
│  │  (Up to ECS_MAX_TASKS)               │   │
│  └──────────────────────────────────────┘   │
└─────┬────────────┬──────────────────────────┘
      │            │
      │            └──────────────┐
      ▼                           ▼
┌─────────────┐          ┌─────────────┐
│   AWS S3    │          │    Redis    │
│  (Storage)  │          │  (Pub/Sub)  │
└─────────────┘          └──────┬──────┘
                                │
                                │ Subscribe to output
                                ▼
                         ┌─────────────┐
                         │  WebSocket  │
                         │   Server    │
                         └──────┬──────┘
                                │
                                ▼
                         ┌─────────────┐
                         │   Browser   │
                         │   (User)    │
                         └─────────────┘
```

## Component Responsibilities

### 1. Next.js Server
- Receives terminal commands from users
- Queues commands to AWS SQS
- Serves the web application

### 2. AWS SQS Queue
- Stores pending terminal commands
- Decouples frontend from workers
- Provides message durability

### 3. ECS Task Orchestrator (New Component)
- **Runs on your server** (not in ECS)
- Monitors SQS queue depth every 30 seconds
- Calculates required number of tasks
- Launches/stops ECS Fargate tasks as needed
- Formula: `desired_tasks = min(max(queue_depth / messages_per_task, min_tasks), max_tasks)`

### 4. ECS Fargate Tasks (Replaces K8s Pods)
- Docker containers running worker code
- Serverless - no cluster to manage
- Auto-scaled by orchestrator
- Each task:
  - Polls SQS for commands
  - Downloads project from S3
  - Executes commands in isolated environment
  - Publishes output to Redis pub/sub
  - Stops when queue is empty (saves costs)

### 5. AWS S3
- Stores project files
- Workers download/upload files as needed
- Unchanged from K8s version

### 6. Redis Pub/Sub
- Real-time communication channel
- Workers publish command output
- WebSocket server subscribes and forwards to users
- Unchanged from K8s version

### 7. WebSocket Server
- Maintains persistent connections with users
- Subscribes to Redis channels
- Streams command output to browsers
- Unchanged from K8s version

## Auto-Scaling Logic

```javascript
// Orchestrator checks every 30 seconds
const queueDepth = await getQueueDepth();
const currentTasks = await getRunningTaskCount();

// Calculate desired tasks
const desiredTasks = Math.min(
  Math.max(
    Math.ceil(queueDepth / ECS_MESSAGES_PER_TASK),
    ECS_MIN_TASKS
  ),
  ECS_MAX_TASKS
);

// Scale up if needed
if (desiredTasks > currentTasks) {
  const tasksToLaunch = desiredTasks - currentTasks;
  await launchTasks(tasksToLaunch);
}

// Scale down happens automatically when tasks finish processing
// and find no more messages in the queue
```

## Key Differences from Kubernetes

| Aspect | Kubernetes | ECS Fargate |
|--------|-----------|-------------|
| **Cluster Management** | Requires cluster setup | Serverless, no cluster |
| **Scaling** | HPA with metrics server | Custom orchestrator + queue depth |
| **Cost Model** | Pay for nodes (always running) | Pay per task-second (when running) |
| **Deployment** | kubectl + YAML manifests | AWS CLI + JSON task definition |
| **Monitoring** | kubectl logs, dashboard | CloudWatch Logs, ECS Console |
| **Worker Code** | Same | Same (no changes!) |
| **Isolation** | Pod per worker | Task per worker |
| **Startup Time** | Seconds to minutes | Seconds |

## Data Flow Example

1. **User types command:** `npm install express`
   
2. **Frontend → SQS:**
   ```json
   {
     "projectId": "abc123",
     "terminalId": "term-1",
     "command": "npm install express"
   }
   ```

3. **Orchestrator detects:** Queue depth = 5, Running tasks = 1
   - Calculates: Need 1 more task (5 messages / 5 per task = 1)
   - Launches 1 new Fargate task

4. **Worker task:**
   - Polls SQS, gets message
   - Downloads project files from S3
   - Creates `/tmp/workspaces/abc123/`
   - Runs `npm install express` in that directory
   - Streams output to Redis channel `terminal:abc123:term-1`
   - Uploads changed files back to S3
   - Deletes SQS message
   - Continues polling or exits if no more messages

5. **WebSocket server:**
   - Subscribed to Redis channel
   - Receives output chunks
   - Forwards to user's browser via WebSocket

6. **User sees:** Real-time output in terminal UI

## Configuration Files

### Environment Variables (`.env`)
```bash
ECS_CLUSTER_NAME=cloudide-cluster
ECS_TASK_DEFINITION=cloudide-worker
ECS_SUBNETS=subnet-xxx,subnet-yyy
ECS_SECURITY_GROUPS=sg-xxx
ECS_MIN_TASKS=1
ECS_MAX_TASKS=10
ECS_MESSAGES_PER_TASK=5
```

### Task Definition (`ecs/task-definition.json`)
- Container image from ECR
- CPU: 512, Memory: 1024 MB
- Environment variables
- IAM roles for S3/SQS access
- CloudWatch logging

### IAM Roles (`ecs/iam-policies.json`)
- **Task Execution Role:** Pull images, write logs, read secrets
- **Task Role:** Access S3 and SQS

## Cost Estimation

**Scenario:** Average 10 commands/minute, 2 minutes per command

- **Queue depth:** ~20 messages
- **Tasks needed:** 4 (at 5 messages per task)
- **Cost per hour:** 4 tasks × $0.04 = $0.16/hour
- **Cost per day:** $3.84
- **Cost per month:** ~$115

**With min_tasks=0 during idle:**
- Tasks only run when needed
- Idle cost: $0
- Much cheaper than always-on K8s nodes

## Monitoring Dashboard

Key metrics to track:
1. **SQS Queue Depth** - ApproximateNumberOfMessages
2. **Running Tasks** - ECS task count
3. **Task CPU/Memory** - CloudWatch Container Insights
4. **Task Failures** - ECS stopped tasks with errors
5. **Command Duration** - Average time in queue + execution

## Deployment Workflow

```bash
# 1. Make code changes
vim workers/terminal-worker.ts

# 2. Build and push image
npm run ecs:build-push

# 3. Register new task definition (auto-increments version)
aws ecs register-task-definition --cli-input-json file://ecs/task-definition.json

# 4. Update orchestrator to use new version (in .env)
ECS_TASK_DEFINITION=cloudide-worker:2

# 5. Restart orchestrator
pm2 restart cloudide-ecs-orchestrator

# 6. New tasks will use the updated image
```

## Security Considerations

1. **VPC Security:**
   - Tasks run in private subnets (recommended)
   - Use NAT Gateway for internet access
   - Security groups restrict traffic

2. **IAM Roles:**
   - Principle of least privilege
   - Task role only has S3/SQS access
   - No hardcoded credentials

3. **Secrets:**
   - Stored in AWS Secrets Manager
   - Encrypted at rest
   - Injected at runtime

4. **Container Isolation:**
   - Each task is isolated
   - No shared filesystem
   - Clean environment per execution
