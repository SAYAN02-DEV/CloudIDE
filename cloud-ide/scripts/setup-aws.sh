#!/bin/bash

# Cloud IDE Setup Script
# This script sets up the required AWS resources for the Cloud IDE

set -e

echo "🚀 Cloud IDE Setup Script"
echo "========================="
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found. Please create it from .env.example"
    exit 1
fi

echo "📋 Configuration:"
echo "  AWS Region: ${AWS_REGION}"
echo "  S3 Bucket: ${AWS_S3_BUCKET_NAME}"
echo ""

# Create S3 Bucket
echo "📦 Creating S3 bucket..."
if aws s3 mb s3://${AWS_S3_BUCKET_NAME} --region ${AWS_REGION} 2>/dev/null; then
    echo "✅ S3 bucket created: ${AWS_S3_BUCKET_NAME}"
else
    echo "ℹ️  S3 bucket already exists or creation failed"
fi

# Enable versioning on S3 bucket
echo "🔄 Enabling versioning on S3 bucket..."
aws s3api put-bucket-versioning \
    --bucket ${AWS_S3_BUCKET_NAME} \
    --versioning-configuration Status=Enabled \
    --region ${AWS_REGION}
echo "✅ Versioning enabled"

# Create CORS configuration for S3
echo "🌐 Configuring CORS for S3 bucket..."
cat > /tmp/cors.json <<EOF
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}
EOF

aws s3api put-bucket-cors \
    --bucket ${AWS_S3_BUCKET_NAME} \
    --cors-configuration file:///tmp/cors.json \
    --region ${AWS_REGION}
echo "✅ CORS configured"

# Create SQS Queue
echo "📬 Creating SQS queue..."
QUEUE_URL=$(aws sqs create-queue \
    --queue-name cloudide-terminal-queue \
    --region ${AWS_REGION} \
    --attributes VisibilityTimeout=300,ReceiveMessageWaitTimeSeconds=20 \
    --output text \
    --query 'QueueUrl' 2>/dev/null || echo "")

if [ -n "$QUEUE_URL" ]; then
    echo "✅ SQS queue created: $QUEUE_URL"
    echo ""
    echo "📝 Update your .env file with:"
    echo "AWS_SQS_QUEUE_URL=$QUEUE_URL"
else
    # Queue might already exist, try to get URL
    QUEUE_URL=$(aws sqs get-queue-url \
        --queue-name cloudide-terminal-queue \
        --region ${AWS_REGION} \
        --output text \
        --query 'QueueUrl' 2>/dev/null || echo "")
    
    if [ -n "$QUEUE_URL" ]; then
        echo "ℹ️  SQS queue already exists: $QUEUE_URL"
    else
        echo "❌ Failed to create or get SQS queue"
    fi
fi

echo ""
echo "✅ AWS setup complete!"
echo ""
echo "Next steps:"
echo "1. Update your .env file with the SQS queue URL above"
echo "2. Start local services: docker-compose up -d"
echo "3. Install dependencies: npm install"
echo "4. Run the application: npm run dev:all"
echo ""
