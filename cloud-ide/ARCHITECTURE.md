# Cloud IDE Project Structure

## Overview
This document outlines the complete architecture and file structure of the Cloud IDE project.

## Directory Structure

```
cloud-ide/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── v1/                   # Version 1 APIs (legacy)
│   │   │   ├── signin/
│   │   │   └── signup/
│   │   └── v2/                   # Version 2 APIs (new)
│   │       ├── auth/
│   │       │   └── login/        # JWT authentication
│   │       └── projects/
│   │           ├── route.ts      # List/Create projects
│   │           ├── [id]/
│   │           │   ├── route.ts  # Get/Update/Delete project
│   │           │   └── files/
│   │           │       ├── route.ts           # List/Create files
│   │           │       └── [path]/route.ts    # Get/Delete file
│   │           └── [projectId]/
│   │               └── files/
│   ├── components/               # React Components
│   │   ├── CollaborativeEditor.tsx    # Monaco editor with CRDT
│   │   ├── CollaborativeTerminal.tsx  # Web terminal
│   │   ├── IDEPage.tsx               # Main IDE interface
│   │   ├── CreateProjectDialog.tsx
│   │   ├── HomePage.tsx
│   │   ├── Navbar.tsx
│   │   └── ProjectCard.tsx
│   ├── home/
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── lib/                          # Core Libraries
│   ├── crdt/
│   │   └── CRDTService.ts       # Yjs CRDT + Redis integration
│   ├── editor/
│   │   └── MonacoBinding.ts     # Custom Monaco-Yjs binding
│   ├── storage/
│   │   └── S3Service.ts         # AWS S3 file storage
│   ├── terminal/
│   │   ├── SQSTerminalService.ts    # SQS queue management
│   │   └── TerminalWorker.ts        # Command execution worker
│   └── websocket/
│       └── WebSocketServer.ts   # Socket.IO server
│
├── db/                           # Database Layer
│   ├── index.ts                 # MongoDB connection
│   ├── queries.ts               # Database queries
│   └── schema.ts                # Mongoose schemas
│
├── components/                   # Shared UI Components
│   └── ui/
│       └── resizable-panels.tsx # Resizable layout panels
│
├── k8s/                          # Kubernetes Configuration
│   └── worker-deployment.yaml   # Worker pod deployment + HPA
│
├── scripts/                      # Setup Scripts
│   ├── setup-aws.sh            # AWS resource setup
│   └── setup-localstack.sh     # LocalStack setup for dev
│
├── public/                       # Static Files
│
├── .env.example                  # Environment template
├── .env                         # Environment variables (gitignored)
├── docker-compose.yml           # Local development services
├── Dockerfile.worker            # Worker container image
├── server.ts                    # WebSocket server entry point
├── package.json
├── tsconfig.json
├── next.config.ts
└── README.md
```

## Architecture Components

### 1. Frontend (Next.js + React)
- **CollaborativeEditor**: Real-time code editor using Monaco + Yjs CRDT
- **CollaborativeTerminal**: Web-based terminal with command execution
- **IDEPage**: Main IDE interface with file explorer and panels

### 2. Backend Services

#### API Layer (Next.js API Routes)
- **Authentication**: JWT-based auth with MongoDB
- **Project Management**: CRUD operations for projects
- **File Management**: S3-backed file operations

#### Real-time Communication
- **WebSocketServer**: Socket.IO server for real-time events
- **CRDTService**: Yjs document synchronization with Redis
- **Redis Pub/Sub**: Message broadcasting across instances

#### Storage & Queue
- **S3Service**: AWS S3 integration for file storage
- **SQSTerminalService**: AWS SQS for command queuing

#### Worker System
- **TerminalWorker**: Kubernetes pods that execute terminal commands
- Downloads project from S3
- Executes command in isolated environment
- Uploads changes back to S3
- Streams output via Redis + WebSocket

### 3. Database
- **MongoDB**: User accounts and project metadata
- **Redis**: CRDT state and pub/sub messaging

### 4. Infrastructure

#### Kubernetes
- Auto-scaling worker pods (1-10 replicas)
- HPA based on CPU/memory usage
- ConfigMaps and Secrets for configuration

#### Docker
- Worker container with Node.js + system tools
- Isolated execution environment

## Data Flow

### Collaborative Editing Flow
1. User opens file → WebSocket connection established
2. Client gets CRDT state from Redis via WebSocket
3. User makes edit → CRDT update created
4. Update sent to WebSocket server
5. Server applies update to Yjs document
6. Document saved to Redis
7. Update published to Redis channel
8. All connected clients receive update
9. Clients apply update to their local CRDT
10. Periodic sync to S3 for persistence

### Terminal Command Flow
1. User enters command → Sent via WebSocket
2. WebSocket server → Publishes to Redis
3. Redis → Backend receives command
4. Command → Queued in AWS SQS
5. Worker pod → Polls SQS queue
6. Worker → Downloads project from S3
7. Worker → Executes command
8. Output → Published to Redis
9. Redis → WebSocket server receives output
10. WebSocket → Broadcasts to clients
11. Worker → Uploads modified files to S3

## Key Technologies

- **Frontend**: Next.js 16, React 19, TypeScript, Monaco Editor
- **Real-time**: Socket.IO, Yjs CRDT, Redis Pub/Sub
- **Storage**: AWS S3, MongoDB
- **Queue**: AWS SQS
- **Orchestration**: Kubernetes with HPA
- **Containerization**: Docker
- **Authentication**: JWT, bcryptjs

## Environment Variables

See `.env.example` for complete configuration options:
- MongoDB connection
- Redis connection
- AWS credentials (S3, SQS)
- WebSocket configuration
- Security secrets

## Deployment

### Development
```bash
# Start local services
docker-compose up -d

# Setup LocalStack (optional)
./scripts/setup-localstack.sh

# Install dependencies
npm install

# Run all services
npm run dev:all
```

### Production
```bash
# Setup AWS resources
./scripts/setup-aws.sh

# Build worker image
docker build -f Dockerfile.worker -t cloudide-worker:latest .

# Deploy to Kubernetes
kubectl apply -f k8s/worker-deployment.yaml

# Build and deploy Next.js app
npm run build
npm start
```

## Scalability Features

1. **Horizontal Scaling**: Multiple Next.js instances behind load balancer
2. **Worker Auto-scaling**: Kubernetes HPA scales workers based on load
3. **Distributed State**: Redis handles state across instances
4. **Cloud Storage**: S3 provides unlimited file storage
5. **Queue-based Processing**: SQS decouples command execution

## Security Considerations

1. **Authentication**: JWT tokens for API and WebSocket auth
2. **Authorization**: User ownership verification for projects
3. **Isolation**: Each terminal command runs in isolated container
4. **Environment Separation**: Secrets managed via Kubernetes Secrets
5. **CORS**: Configured for WebSocket and S3 access

## Future Enhancements

- [ ] Live preview for web projects
- [ ] Git integration
- [ ] Code intelligence and autocomplete
- [ ] Multiple terminal tabs
- [ ] File upload/download
- [ ] Project templates
- [ ] Team collaboration features
- [ ] Video/audio chat
- [ ] Code review tools
- [ ] Deployment integrations
