#!/bin/bash
set -e

echo "🚀 Setting up ECS Terminal Infrastructure..."

# Get AWS Account ID and Region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}

echo "   Account ID: $ACCOUNT_ID"
echo "   Region: $REGION"

# 1. Create ECR repository for terminal image
echo ""
echo "📦 Creating ECR repository..."
aws ecr create-repository \
    --repository-name cloudide-terminal \
    --region $REGION \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 \
    2>/dev/null || echo "   Repository already exists"

# 2. Create IAM role for terminal tasks
echo ""
echo "🔐 Creating IAM role for terminal tasks..."

# Task execution role (for pulling images, logging, etc.)
cat > /tmp/task-execution-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "ecs-tasks.amazonaws.com"
    },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document file:///tmp/task-execution-trust-policy.json \
    2>/dev/null || echo "   Execution role already exists"

aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
    2>/dev/null || true

# Task role (for S3 access, ECS Exec, etc.)
aws iam create-role \
    --role-name cloudide-terminal-task-role \
    --assume-role-policy-document file:///tmp/task-execution-trust-policy.json \
    2>/dev/null || echo "   Task role already exists"

# Attach policies to task role
cat > /tmp/terminal-task-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::cloudide-projects",
        "arn:aws:s3:::cloudide-projects/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
    --role-name cloudide-terminal-task-role \
    --policy-name TerminalTaskPolicy \
    --policy-document file:///tmp/terminal-task-policy.json \
    2>/dev/null || true

# 3. Create CloudWatch log group
echo ""
echo "📝 Creating CloudWatch log group..."
aws logs create-log-group \
    --log-group-name /ecs/cloudide-terminal \
    --region $REGION \
    2>/dev/null || echo "   Log group already exists"

# 4. Build and push Docker image
echo ""
echo "🐳 Building and pushing Docker image..."

# Login to ECR
aws ecr get-login-password --region $REGION | \
    docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Build image
docker build -f Dockerfile.terminal -t cloudide-terminal:latest .

# Tag and push
docker tag cloudide-terminal:latest ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/cloudide-terminal:latest
docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/cloudide-terminal:latest

# 5. Register task definition
echo ""
echo "📋 Registering ECS task definition..."

# Update task definition with actual values
sed -e "s/{ACCOUNT_ID}/$ACCOUNT_ID/g" \
    -e "s/{REGION}/$REGION/g" \
    ecs/terminal-task-definition.json > /tmp/terminal-task-definition.json

aws ecs register-task-definition \
    --cli-input-json file:///tmp/terminal-task-definition.json \
    --region $REGION

# 6. Create ECS cluster if needed
echo ""
echo "🏗️  Ensuring ECS cluster exists..."
aws ecs create-cluster \
    --cluster-name cloudide-cluster \
    --region $REGION \
    2>/dev/null || echo "   Cluster already exists"

# Enable ECS Exec for the cluster
aws ecs update-cluster-settings \
    --cluster cloudide-cluster \
    --settings name=containerInsights,value=enabled \
    --region $REGION

echo ""
echo "✅ ECS Terminal infrastructure setup complete!"
echo ""
echo "📝 Update your .env file with:"
echo "   ECS_CLUSTER_NAME=cloudide-cluster"
echo "   ECS_TASK_DEFINITION=cloudide-terminal-task"
echo "   ECS_SUBNETS=<your-subnet-ids>"
echo "   ECS_SECURITY_GROUPS=<your-security-group-ids>"
echo ""
echo "🚀 You can now use ECS-based terminals!"
