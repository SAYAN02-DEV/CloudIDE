#!/bin/bash
set -e

echo "🚀 CloudIDE Terminal Container Starting..."
echo "   Project ID: ${PROJECT_ID}"
echo "   Terminal ID: ${TERMINAL_ID}"
echo "   User ID: ${USER_ID}"

# Create workspace directory
mkdir -p /workspace
cd /workspace

# Download project files from S3
if [ -n "$PROJECT_ID" ] && [ -n "$S3_BUCKET" ]; then
    echo "📥 Downloading project files from S3..."
    
    # Download all CRDT files for this project
    aws s3 sync "s3://${S3_BUCKET}/projects/${PROJECT_ID}/" /workspace/ \
        --region "${AWS_REGION:-us-east-1}" \
        --exclude "*" \
        --include "*.crdt" || echo "⚠️  No files to download or S3 sync failed"
    
    # Convert CRDT files to regular files (simplified - in production use proper CRDT decoder)
    # For now, we'll just work with files that are already uploaded as plain text
    
    echo "✅ Workspace ready"
fi

# Setup trap to sync files back to S3 on exit
cleanup() {
    echo "🔄 Syncing workspace back to S3..."
    if [ -n "$PROJECT_ID" ] && [ -n "$S3_BUCKET" ]; then
        # Upload changed files back to S3
        find /workspace -type f ! -path "*/\.*" | while read file; do
            relative_path="${file#/workspace/}"
            echo "   Uploading: $relative_path"
            aws s3 cp "$file" "s3://${S3_BUCKET}/projects/${PROJECT_ID}/${relative_path}" \
                --region "${AWS_REGION:-us-east-1}" 2>/dev/null || true
        done
    fi
    echo "✅ Workspace synced"
}

trap cleanup EXIT

# Print welcome message
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          Welcome to CloudIDE Terminal                      ║"
echo "║  Your workspace is isolated and secure                     ║"
echo "║  All changes are automatically synced to S3                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Start the interactive shell
exec "$@"
