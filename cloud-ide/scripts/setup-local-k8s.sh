#!/bin/bash

echo "🚀 Setting up CloudIDE Terminal Worker - Local Development"

# Check if Minikube is installed
if ! command -v minikube &> /dev/null; then
    echo "❌ Minikube not found. Please install Minikube first."
    echo "Visit: https://minikube.sigs.k8s.io/docs/start/"
    exit 1
fi

# Start Minikube if not running
if ! minikube status &> /dev/null; then
    echo "🔧 Starting Minikube..."
    minikube start --driver=docker --cpus=4 --memory=4096
fi

# Build worker Docker image
echo "🔨 Building worker Docker image..."
docker build -t cloudide-worker:latest -f Dockerfile.worker .

# Load image into Minikube
echo "📦 Loading image into Minikube..."
minikube image load cloudide-worker:latest

# Create namespace and config
echo "⚙️  Creating Kubernetes resources..."
kubectl apply -f k8s/local-config.yaml
kubectl apply -f k8s/terminal-worker-deployment.yaml

# Wait for deployment
echo "⏳ Waiting for worker pods to be ready..."
kubectl wait --for=condition=ready pod -l app=terminal-worker -n cloudide-workers --timeout=120s

echo "✅ Terminal Worker deployed successfully!"
echo ""
echo "📊 Check worker status:"
echo "   kubectl get pods -n cloudide-workers"
echo ""
echo "📝 View worker logs:"
echo "   kubectl logs -f -l app=terminal-worker -n cloudide-workers"
echo ""
echo "🔍 Monitor HPA:"
echo "   kubectl get hpa -n cloudide-workers -w"
