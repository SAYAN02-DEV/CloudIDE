#!/bin/bash

# CloudIDE ECS Fargate Setup Script
# This script sets up ECS infrastructure to replace Kubernetes pods

set -e

echo "🚀 CloudIDE ECS Fargate Setup"
echo "================================"

# Configuration
REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CLUSTER_NAME="cloudide-cluster"
TASK_FAMILY="cloudide-worker"
ECR_REPO="cloudide-worker"
LOG_GROUP="/ecs/cloudide-worker"

echo "📋 Using AWS Account: $ACCOUNT_ID"
echo "📋 Region: $REGION"

# Step 1: Create ECS Cluster
echo ""
echo "1️⃣ Creating ECS Cluster..."
if aws ecs describe-clusters --clusters $CLUSTER_NAME --region $REGION --query 'clusters[0].status' --output text 2>/dev/null | grep -q "ACTIVE"; then
    echo "✅ ECS Cluster '$CLUSTER_NAME' already exists"
else
    aws ecs create-cluster \
        --cluster-name $CLUSTER_NAME \
        --region $REGION \
        --capacity-providers FARGATE FARGATE_SPOT \
        --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1
    echo "✅ Created ECS Cluster: $CLUSTER_NAME"
fi

# Step 2: Create ECR Repository
echo ""
echo "2️⃣ Creating ECR Repository..."
if aws ecr describe-repositories --repository-names $ECR_REPO --region $REGION 2>/dev/null; then
    echo "✅ ECR Repository '$ECR_REPO' already exists"
else
    aws ecr create-repository \
        --repository-name $ECR_REPO \
        --region $REGION \
        --image-scanning-configuration scanOnPush=true
    echo "✅ Created ECR Repository: $ECR_REPO"
fi

# Step 3: Create CloudWatch Log Group
echo ""
echo "3️⃣ Creating CloudWatch Log Group..."
if aws logs describe-log-groups --log-group-name-prefix $LOG_GROUP --region $REGION --query "logGroups[?logGroupName=='$LOG_GROUP']" --output text 2>/dev/null | grep -q "$LOG_GROUP"; then
    echo "✅ Log Group '$LOG_GROUP' already exists"
else
    aws logs create-log-group \
        --log-group-name $LOG_GROUP \
        --region $REGION
    echo "✅ Created CloudWatch Log Group: $LOG_GROUP"
fi

# Step 4: Create IAM Roles
echo ""
echo "4️⃣ Creating IAM Roles..."

# Task Execution Role
EXEC_ROLE_NAME="ecsTaskExecutionRole"
if aws iam get-role --role-name $EXEC_ROLE_NAME 2>/dev/null; then
    echo "✅ Task Execution Role '$EXEC_ROLE_NAME' already exists"
else
    aws iam create-role \
        --role-name $EXEC_ROLE_NAME \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }'
    
    aws iam attach-role-policy \
        --role-name $EXEC_ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
    
    echo "✅ Created Task Execution Role: $EXEC_ROLE_NAME"
fi

# Task Role (for S3 and SQS access)
TASK_ROLE_NAME="cloudide-worker-task-role"
if aws iam get-role --role-name $TASK_ROLE_NAME 2>/dev/null; then
    echo "✅ Task Role '$TASK_ROLE_NAME' already exists"
else
    aws iam create-role \
        --role-name $TASK_ROLE_NAME \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }'
    
    # Attach S3 and SQS policies
    aws iam put-role-policy \
        --role-name $TASK_ROLE_NAME \
        --policy-name cloudide-worker-policy \
        --policy-document '{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:GetObject",
                        "s3:PutObject",
                        "s3:DeleteObject",
                        "s3:ListBucket"
                    ],
                    "Resource": [
                        "arn:aws:s3:::cloudide-projects/*",
                        "arn:aws:s3:::cloudide-projects"
                    ]
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "sqs:ReceiveMessage",
                        "sqs:DeleteMessage",
                        "sqs:SendMessage",
                        "sqs:GetQueueAttributes"
                    ],
                    "Resource": "arn:aws:sqs:'$REGION':'$ACCOUNT_ID':cloudide-terminal-queue"
                }
            ]
        }'
    
    echo "✅ Created Task Role: $TASK_ROLE_NAME"
fi

# Step 5: Build and Push Docker Image
echo ""
echo "5️⃣ Building and Pushing Docker Image..."
echo "⚠️  Please ensure you're in the cloud-ide directory"

read -p "Do you want to build and push the Docker image now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Login to ECR
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
    
    # Build image
    docker build -f Dockerfile.worker -t $ECR_REPO:latest .
    
    # Tag and push
    docker tag $ECR_REPO:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO:latest
    docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO:latest
    
    echo "✅ Docker image pushed to ECR"
fi

# Step 6: Update Task Definition
echo ""
echo "6️⃣ Registering ECS Task Definition..."

# Update task definition with actual values
sed -i.bak \
    -e "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" \
    -e "s/ap-south-1/$REGION/g" \
    ecs/task-definition.json

aws ecs register-task-definition \
    --cli-input-json file://ecs/task-definition.json \
    --region $REGION

echo "✅ Task Definition registered: $TASK_FAMILY"

# Step 7: Create Secrets in Secrets Manager
echo ""
echo "7️⃣ Setting up AWS Secrets Manager..."
echo "⚠️  Please create the following secrets manually in AWS Secrets Manager:"
echo "   - cloudide/mongodb-uri"
echo "   - cloudide/redis-host"
echo "   - cloudide/redis-port"
echo "   - cloudide/aws-access-key-id"
echo "   - cloudide/aws-secret-access-key"
echo "   - cloudide/s3-bucket-name"
echo "   - cloudide/sqs-queue-url"

# Step 8: Update .env file
echo ""
echo "8️⃣ Updating .env file..."
echo "⚠️  Please update your .env file with:"
echo "   ECS_CLUSTER_NAME=$CLUSTER_NAME"
echo "   ECS_TASK_DEFINITION=$TASK_FAMILY"
echo "   ECS_SUBNETS=<your-subnet-ids>"
echo "   ECS_SECURITY_GROUPS=<your-security-group-ids>"

echo ""
echo "✅ ECS Setup Complete!"
echo ""
echo "📝 Next Steps:"
echo "   1. Update .env with your VPC subnet and security group IDs"
echo "   2. Create secrets in AWS Secrets Manager"
echo "   3. Test with: npm run ecs:test"
echo "   4. Start task orchestrator: npm run ecs:orchestrator"
