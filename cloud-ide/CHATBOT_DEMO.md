# AI Chatbot Feature - Demo Guide

## Overview
The AI chatbot feature allows users to create, edit, and delete files using natural language commands. The AI assistant integrates with OpenAI's GPT models to understand user requests and perform file operations automatically.

## Features

### 🤖 AI-Powered File Operations
- **Create Files**: "Create a React component called Button"
- **Edit Files**: "Update the package.json to add lodash dependency"
- **Delete Files**: "Remove the old config file"
- **Read Files**: "Show me the contents of the README file"

### 💬 Real-time Chat Interface
- Chat panel integrated into the IDE
- Real-time message history
- File operation tracking
- Visual feedback for AI actions

### 🔄 WebSocket Integration
- Real-time chat updates across all connected users
- Instant file operation notifications
- Collaborative awareness of AI changes

## How It Works

### 1. User Interaction
Users can open the AI chat panel by clicking the "AI" button in the top toolbar. They can then type natural language requests like:
- "Create a new React component for a login form"
- "Add a README file with project description"
- "Update the tsconfig.json to include strict mode"

### 2. AI Processing
The system sends the user's message along with project context to OpenAI's GPT model, which:
- Analyzes the request
- Determines required file operations
- Generates appropriate file content
- Returns structured commands

### 3. File Operations
The AI's response is parsed to extract file operations in this format:
```
[FILE_OPERATION]
action: create|edit|delete
path: relative/path/to/file
content: (file content for create/edit)
description: Brief description
[/FILE_OPERATION]
```

### 4. Execution & Feedback
- File operations are executed via the existing S3 storage system
- Changes are broadcast to all connected users via WebSocket
- Visual feedback shows completed operations in the chat

## Technical Architecture

### Components
1. **ChatService** (`lib/ai/ChatService.ts`)
   - OpenAI integration
   - File operation parsing
   - S3 storage integration

2. **Chat API** (`app/api/v2/projects/[projectId]/chat/route.ts`)
   - REST endpoints for chat functionality
   - Authentication and authorization
   - Chat history management

3. **ChatPanel** (`app/components/ChatPanel.tsx`)
   - React component for chat interface
   - Real-time message display
   - File operation visualization

4. **Database Schema** (`db/schema.ts`)
   - ChatMessage model for history storage
   - File operation tracking

### Integration Points
- **S3Service**: File storage and retrieval
- **WebSocket**: Real-time collaboration
- **MongoDB**: Chat history persistence
- **JWT Auth**: Security and user context

## Setup Instructions

### 1. Install Dependencies
```bash
npm install openai
```

### 2. Environment Configuration
Add to `.env`:
```env
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4
```

### 3. Database Migration
The ChatMessage schema is automatically created when the application starts.

### 4. Start Services
```bash
# Start the main application
npm run dev

# Start WebSocket server (in separate terminal)
npm run ws-server
```

## Usage Examples

### Example 1: Create a React Component
**User**: "Create a React component called UserProfile that displays user information"

**AI Response**: 
```
I'll create a UserProfile React component for you.

[FILE_OPERATION]
action: create
path: components/UserProfile.tsx
content: import React from 'react';

interface UserProfileProps {
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
}

export const UserProfile: React.FC<UserProfileProps> = ({ user }) => {
  return (
    <div className="user-profile">
      <div className="avatar">
        {user.avatar ? (
          <img src={user.avatar} alt={user.name} />
        ) : (
          <div className="avatar-placeholder">{user.name.charAt(0)}</div>
        )}
      </div>
      <div className="user-info">
        <h3>{user.name}</h3>
        <p>{user.email}</p>
      </div>
    </div>
  );
};
description: Created UserProfile React component with TypeScript
[/FILE_OPERATION]
```

### Example 2: Update Configuration
**User**: "Add TypeScript strict mode to the tsconfig.json"

**AI Response**:
```
I'll update your tsconfig.json to enable strict mode.

[FILE_OPERATION]
action: edit
path: tsconfig.json
content: {
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
description: Enabled TypeScript strict mode in tsconfig.json
[/FILE_OPERATION]
```

## Security Considerations

### File Path Validation
- All file paths are validated to prevent directory traversal
- Paths are restricted to the project directory
- No access to system files or parent directories

### Authentication
- All chat API endpoints require JWT authentication
- Users can only access their own projects
- File operations are logged for audit trails

### Rate Limiting
- Chat API includes rate limiting to prevent abuse
- OpenAI API calls are throttled appropriately
- File operation limits per user/project

## Troubleshooting

### Common Issues

1. **OpenAI API Key Not Set**
   - Error: "OpenAI API key not configured"
   - Solution: Add `OPENAI_API_KEY` to `.env` file

2. **File Operation Fails**
   - Error: "Failed to execute file operation"
   - Check S3 permissions and bucket configuration
   - Verify file paths are valid

3. **Chat History Not Loading**
   - Check MongoDB connection
   - Verify JWT token is valid
   - Check browser console for errors

### Debug Mode
Enable debug logging by setting:
```env
DEBUG=chatbot:*
```

## Future Enhancements

### Planned Features
- **Code Analysis**: AI can analyze existing code before making changes
- **Multi-file Operations**: Handle complex operations across multiple files
- **Undo/Redo**: Ability to revert AI-generated changes
- **Custom Prompts**: User-defined AI behavior and coding standards
- **Integration Testing**: AI can write and run tests for generated code

### Advanced Capabilities
- **Project Scaffolding**: Generate entire project structures
- **Code Refactoring**: Intelligent code improvements and optimizations
- **Documentation Generation**: Auto-generate docs from code
- **Dependency Management**: Smart package.json updates and conflict resolution

## API Reference

### Chat Endpoints

#### Send Message
```http
POST /api/v2/projects/:projectId/chat
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "message": "Create a React component",
  "chatHistory": [...] // Optional previous messages
}
```

#### Get Chat History
```http
GET /api/v2/projects/:projectId/chat?limit=50&offset=0
Authorization: Bearer <jwt-token>
```

#### Clear Chat History
```http
DELETE /api/v2/projects/:projectId/chat
Authorization: Bearer <jwt-token>
```

### WebSocket Events

#### Chat Message
```javascript
socket.emit('chat-message', {
  projectId: 'project-id',
  message: 'User message',
  timestamp: new Date()
});
```

#### AI Response
```javascript
socket.on('ai-response', (data) => {
  console.log('AI Response:', data.message);
  console.log('File Operations:', data.fileOperations);
});
```

This AI chatbot feature transforms the cloud IDE into an intelligent development environment where users can accomplish complex file operations through simple natural language commands.