#!/bin/bash

# AI Chatbot Feature Setup Script
# This script helps set up the AI chatbot feature for the Cloud IDE

set -e

echo "🤖 Setting up AI Chatbot Feature for Cloud IDE..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the cloud-ide directory"
    exit 1
fi

# Install OpenAI dependency
echo "📦 Installing OpenAI dependency..."
npm install openai@^4.73.1

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
fi

# Check if OpenAI API key is set
if ! grep -q "OPENAI_API_KEY=" .env; then
    echo "🔑 Adding OpenAI configuration to .env..."
    echo "" >> .env
    echo "# OpenAI Configuration" >> .env
    echo "OPENAI_API_KEY=your-openai-api-key-here" >> .env
    echo "OPENAI_MODEL=gpt-4" >> .env
fi

# Check MongoDB connection
echo "🗄️  Checking MongoDB connection..."
if ! command -v mongosh &> /dev/null && ! command -v mongo &> /dev/null; then
    echo "⚠️  Warning: MongoDB CLI not found. Make sure MongoDB is running."
else
    echo "✅ MongoDB CLI found"
fi

# Check Redis connection
echo "🔴 Checking Redis connection..."
if ! command -v redis-cli &> /dev/null; then
    echo "⚠️  Warning: Redis CLI not found. Make sure Redis is running."
else
    if redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis is running"
    else
        echo "⚠️  Warning: Redis is not responding. Make sure Redis is running."
    fi
fi

# Build the project
echo "🔨 Building the project..."
npm run build

echo ""
echo "✅ AI Chatbot Feature setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Set your OpenAI API key in the .env file:"
echo "   OPENAI_API_KEY=your-actual-api-key-here"
echo ""
echo "2. Make sure MongoDB and Redis are running:"
echo "   - MongoDB: mongod"
echo "   - Redis: redis-server"
echo ""
echo "3. Start the development servers:"
echo "   npm run dev:all"
echo ""
echo "4. Open the IDE and click the 'AI' button to start chatting!"
echo ""
echo "🔗 For more information, see CHATBOT_DEMO.md"