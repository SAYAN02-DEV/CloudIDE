#!/bin/bash

# LocalStack Setup Script
# Sets up S3 and SQS in LocalStack for local development

set -e

echo "🚀 Setting up LocalStack for Cloud IDE"
echo "======================================"
echo ""

# Wait for LocalStack to be ready
echo "⏳ Waiting for LocalStack to start..."
until curl -s http://localhost:4566/_localstack/health | grep -q '"s3": "available"'; do
    sleep 2
done
echo "✅ LocalStack is ready"

# Configure AWS CLI to use LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

ENDPOINT_URL="http://localhost:4566"

# Create S3 Bucket
echo "📦 Creating S3 bucket in LocalStack..."
aws --endpoint-url=$ENDPOINT_URL s3 mb s3://cloudide-projects || echo "Bucket already exists"
echo "✅ S3 bucket created"

# Create SQS Queue
echo "📬 Creating SQS queue in LocalStack..."
QUEUE_URL=$(aws --endpoint-url=$ENDPOINT_URL sqs create-queue \
    --queue-name cloudide-terminal-queue \
    --output text \
    --query 'QueueUrl' || echo "")

if [ -n "$QUEUE_URL" ]; then
    echo "✅ SQS queue created: $QUEUE_URL"
else
    echo "ℹ️  Queue might already exist"
fi

echo ""
echo "✅ LocalStack setup complete!"
echo ""
echo "For local development, use these environment variables:"
echo "AWS_ENDPOINT_URL=http://localhost:4566"
echo "AWS_ACCESS_KEY_ID=test"
echo "AWS_SECRET_ACCESS_KEY=test"
echo "AWS_S3_BUCKET_NAME=cloudide-projects"
echo "AWS_SQS_QUEUE_URL=http://localhost:4566/000000000000/cloudide-terminal-queue"
echo ""
