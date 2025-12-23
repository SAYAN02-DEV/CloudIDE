# Cloud IDE - Collaborative Online IDE

A fully-featured collaborative cloud-based IDE with real-time editing, terminal access, and scalable architecture.

## 🏗️ Architecture

### Core Components

1. **🤖 AI-Powered File Operations**
   - Natural language file creation, editing, and deletion
   - Google Gemini AI integration (free tier) for intelligent code generation
   - Context-aware project understanding
   - Real-time chat interface with file operation tracking

2. **Collaborative Editing (CRDT + Redis + WebSocket)**
   - Yjs CRDT for conflict-free collaborative editing
   - Redis pub/sub for broadcasting changes
   - WebSocket connections for real-time sync
   - State persistence in Redis

3. **Storage (AWS S3)**
   - All project files stored in S3
   - Automatic sync on file changes
   - Efficient file retrieval for workers

4. **Terminal Service (SQS + Kubernetes)**
   - Commands queued in AWS SQS
   - Auto-scaling Kubernetes worker pods
   - Docker containers execute commands
   - Output streamed back via Redis + WebSocket

5. **Authentication & Authorization**
   - JWT-based authentication
   - MongoDB for user/project storage
   - Secure WebSocket connections

## 📋 Prerequisites

- Node.js 20+
- Docker & Kubernetes (for workers)
- MongoDB
- Redis
- AWS Account (S3, SQS)

## 🚀 Installation

### 1. Clone and Install Dependencies

```bash
cd cloud-ide
npm install
```

### 2. AI Chatbot Setup (Quick Start)

```bash
# Install AI chatbot feature
chmod +x install-ai-chatbot.sh
./install-ai-chatbot.sh

# Add your Gemini API key to .env
# GEMINI_API_KEY=your-gemini-api-key-here
```

### 3. Environment Configuration
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/cloudide

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET_NAME=cloudide-projects
AWS_SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/account/queue

# WebSocket
WEBSOCKET_PORT=8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080

# Security
JWT_SECRET=your-secret-key
SESSION_SECRET=your-session-key

# Google Gemini (for AI Chatbot - FREE!)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-1.5-flash
```

### 3. AWS Setup

#### Create S3 Bucket

```bash
aws s3 mb s3://cloudide-projects --region us-east-1
```

#### Create SQS Queue

```bash
aws sqs create-queue \
  --queue-name cloudide-terminal-queue \
  --region us-east-1
```

### 4. Local Development

Run all services together:

```bash
# Terminal 1: Start Next.js + WebSocket server
npm run dev:all

# Or separately:
# Terminal 1: Next.js
npm run dev

# Terminal 2: WebSocket Server
npm run ws-server

# Terminal 3: Worker (for local testing)
npm run worker
```

### 5. Production Deployment

#### Build Docker Image for Workers

```bash
docker build -f Dockerfile.worker -t cloudide-worker:latest .
```

#### Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace cloudide-workers

# Update secrets in k8s/worker-deployment.yaml
# Then apply:
kubectl apply -f k8s/worker-deployment.yaml
```

## 🤖 AI Chatbot Feature

The Cloud IDE includes an intelligent AI assistant that can create, edit, and delete files based on natural language commands.

### Quick Setup

1. **Install OpenAI dependency**:
```bash
npm install openai
```

2. **Add OpenAI API key to .env**:
```env
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4
```

3. **Use the setup script**:
```bash
chmod +x scripts/setup-ai-chatbot.sh
./scripts/setup-ai-chatbot.sh
```

### Usage Examples

- **"Create a React component called UserProfile"** → Generates a complete React component with TypeScript
- **"Add a README file with project description"** → Creates a comprehensive README.md
- **"Update package.json to add lodash dependency"** → Modifies package.json with new dependency
- **"Delete the old config file"** → Removes specified files safely

### Features

- 🧠 **Context-Aware**: AI understands your project structure and existing files
- 🔄 **Real-time**: File operations are broadcast to all connected users instantly
- 📝 **History**: Complete chat history with operation tracking
- 🔒 **Secure**: All operations are authenticated and validated
- 🎯 **Precise**: Structured file operations with clear descriptions

For detailed documentation, see [CHATBOT_DEMO.md](./CHATBOT_DEMO.md).

## 🎯 Usage

### Authentication

1. **Register a User**
```bash
curl -X POST http://localhost:3000/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"user","email":"user@example.com","password":"password"}'
```

2. **Login and Get Token**
```bash
curl -X POST http://localhost:3000/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"password"}'
```

### Project Management

1. **Create Project**
```bash
curl -X POST http://localhost:3000/api/v2/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name":"My Project","description":"Test project","stack":"React"}'
```

2. **List Projects**
```bash
curl http://localhost:3000/api/v2/projects \
  -H "Authorization: Bearer YOUR_TOKEN"
```

3. **Get Project Details**
```bash
curl http://localhost:3000/api/v2/projects/PROJECT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### File Operations

1. **List Files**
```bash
curl http://localhost:3000/api/v2/projects/PROJECT_ID/files \
  -H "Authorization: Bearer YOUR_TOKEN"
```

2. **Create/Update File**
```bash
curl -X POST http://localhost:3000/api/v2/projects/PROJECT_ID/files \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"path":"index.js","content":"console.log(\"Hello\");"}'
```

3. **Get File Content**
```bash
curl http://localhost:3000/api/v2/projects/PROJECT_ID/files/index.js \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🔧 Components

### Frontend Components

- **CollaborativeEditor**: Monaco editor with CRDT sync
- **CollaborativeTerminal**: Web-based terminal with command execution
- **IDEPage**: Main IDE interface with file explorer

### Backend Services

- **CRDTService**: Manages collaborative document state
- **WebSocketServer**: Handles real-time connections
- **S3Service**: File storage operations
- **SQSTerminalService**: Command queue management
- **TerminalWorker**: Executes commands in containers

## 📦 API Endpoints

### Authentication
- `POST /api/v2/auth/login` - Login and get JWT token

### Projects
- `GET /api/v2/projects` - List user projects
- `POST /api/v2/projects` - Create new project
- `GET /api/v2/projects/:id` - Get project details
- `PUT /api/v2/projects/:id` - Update project
- `DELETE /api/v2/projects/:id` - Delete project

### Files
- `GET /api/v2/projects/:id/files` - List project files
- `POST /api/v2/projects/:id/files` - Create/update file
- `GET /api/v2/projects/:id/files/:path` - Get file content
- `DELETE /api/v2/projects/:id/files/:path` - Delete file

### AI Chatbot
- `POST /api/v2/projects/:id/chat` - Send message to AI assistant
- `GET /api/v2/projects/:id/chat` - Get chat history
- `DELETE /api/v2/projects/:id/chat` - Clear chat history

## 🔐 WebSocket Events

### Client → Server
- `join-project` - Join project room
- `leave-project` - Leave project room
- `open-file` - Open file for editing
- `edit-document` - Send document changes
- `cursor-update` - Update cursor position
- `terminal-command` - Execute terminal command
- `subscribe-terminal` - Subscribe to terminal output
- `chat-message` - Send chat message to project room

### Server → Client
- `file-opened` - File ready for editing
- `document-update` - Document changes from others
- `user-joined` - User joined project
- `user-left` - User left project
- `cursor-update` - Cursor position from others
- `terminal-output` - Terminal command output
- `chat-message` - Chat message from other users
- `ai-response` - AI assistant response with file operations

## 🎨 Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Editor**: Monaco Editor, Yjs CRDT
- **Real-time**: Socket.IO, Redis
- **Storage**: AWS S3
- **Queue**: AWS SQS
- **Database**: MongoDB
- **Orchestration**: Kubernetes
- **Containerization**: Docker

## 📊 Scalability

- **Horizontal Scaling**: Workers auto-scale based on SQS queue depth
- **State Management**: CRDT ensures consistency without central coordination
- **Distributed Architecture**: Redis pub/sub handles multi-instance deployments
- **Cloud Storage**: S3 provides unlimited scalable storage

## 🐛 Troubleshooting

### WebSocket Connection Issues
- Check CORS settings in WebSocketServer
- Verify JWT token is valid
- Ensure Redis is running

### Terminal Not Working
- Verify SQS queue is created
- Check worker pods are running: `kubectl get pods -n cloudide-workers`
- Review worker logs: `kubectl logs -n cloudide-workers POD_NAME`

### File Save Issues
- Verify AWS credentials are correct
- Check S3 bucket exists and has proper permissions
- Review S3Service logs

## 📝 License

MIT

---

Built with ❤️ for collaborative coding

