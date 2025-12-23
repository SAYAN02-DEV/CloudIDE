# AI Chatbot Feature - Quick Start Guide

## 🤖 Overview
The AI chatbot feature allows you to create, edit, and delete files using natural language commands. It uses Google's Gemini AI (free tier) for intelligent code generation. Simply click the "AI" button in the top toolbar to open the chat panel.

## 🚀 Setup

### 1. Install Dependencies
```bash
npm install @google/generative-ai
```

### 2. Get Free Gemini API Key
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key (completely free!)

### 3. Configure Gemini API Key
Add your Gemini API key to the `.env` file:
```env
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=gemini-1.5-flash
```

### 4. Start the Application
```bash
# Start both Next.js and WebSocket server
npm run dev:all
```

## 💬 Usage Examples

### Create Files
- **"Create a React component called Button"**
- **"Add a package.json file for a Node.js project"**
- **"Create a README file with project description"**

### Edit Files
- **"Update the package.json to add lodash dependency"**
- **"Add TypeScript strict mode to tsconfig.json"**
- **"Update the README with installation instructions"**

### Delete Files
- **"Delete the old config file"**
- **"Remove the test.js file"**

## 🎯 How It Works

1. **User Input**: Type your request in natural language
2. **AI Processing**: Google Gemini analyzes your request and project context
3. **File Operations**: AI generates structured file operations
4. **Execution**: Operations are executed and files are updated in S3
5. **Real-time Updates**: Changes are broadcast to all connected users

## 🔧 Features

- ✅ **Free AI Model**: Uses Google Gemini's generous free tier
- ✅ **Context-Aware**: AI understands your existing project structure
- ✅ **Real-time Collaboration**: File changes are instantly shared
- ✅ **Operation Tracking**: See exactly what files were modified
- ✅ **Chat History**: Complete conversation history with the AI
- ✅ **Secure**: All operations are authenticated and validated

## 💰 Cost & Limits

**Google Gemini Free Tier:**
- 15 requests per minute
- 1,500 requests per day
- 1 million tokens per minute
- **Completely FREE** - no credit card required!

## 📝 File Operation Format

The AI uses this structured format for file operations:

```
[FILE_OPERATION]
action: create|edit|delete
path: relative/path/to/file
content: (file content for create/edit)
description: Brief description of the operation
[/FILE_OPERATION]
```

## 🛡️ Security

- All file paths are validated to prevent directory traversal
- Operations are restricted to the project directory
- JWT authentication required for all API calls
- File operations are logged for audit trails

## 🎨 UI Features

- **Chat Interface**: Clean, modern chat UI integrated into the IDE
- **File Operation Cards**: Visual representation of AI actions
- **Real-time Indicators**: Loading states and operation feedback
- **Resizable Panel**: Adjustable chat panel size

## 🔍 Troubleshooting

### Common Issues

1. **"Gemini API key not configured"**
   - Add `GEMINI_API_KEY` to your `.env` file
   - Get free API key at: https://makersuite.google.com/app/apikey

2. **"Failed to execute file operation"**
   - Check S3 configuration and permissions
   - Verify file paths are valid

3. **Chat not loading**
   - Ensure MongoDB is running
   - Check JWT token validity

4. **Rate limit exceeded**
   - Gemini free tier: 15 requests/minute, 1,500/day
   - Wait a moment and try again

### Debug Tips

- Check browser console for errors
- Verify WebSocket connection in Network tab
- Review server logs for API errors

## 🚀 Advanced Usage

### Complex Operations
The AI can handle sophisticated requests like:
- **"Create a complete React component with props, state, and styling"**
- **"Set up a TypeScript project with proper configuration"**
- **"Add error handling to all API endpoints"**

### Project Scaffolding
- **"Create a basic Express.js server structure"**
- **"Set up a React app with routing and components"**
- **"Initialize a Python Flask project"**

## 📊 Performance

- **Response Time**: Typically 2-5 seconds for simple operations
- **File Size Limits**: Optimized for files under 1MB
- **Concurrent Users**: Supports multiple users per project
- **Rate Limiting**: Built-in protection against API abuse

## 🔮 Future Enhancements

- **Code Analysis**: AI will analyze existing code before making changes
- **Multi-file Operations**: Handle complex operations across multiple files
- **Undo/Redo**: Ability to revert AI-generated changes
- **Custom Prompts**: User-defined AI behavior and coding standards

---

**Ready to try it?** Click the "AI" button in your IDE toolbar and start chatting with your AI assistant!