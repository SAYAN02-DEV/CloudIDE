"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
exports.getChatService = getChatService;
const generative_ai_1 = require("@google/generative-ai");
const S3Service_1 = require("../storage/S3Service");
class ChatService {
    constructor() {
        this.genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        this.s3Service = (0, S3Service_1.getS3Service)();
    }
    async processUserMessage(projectId, userMessage, projectFiles = []) {
        try {
            const systemPrompt = this.createSystemPrompt(projectId, projectFiles);
            // Use the working model format
            const modelName = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';
            console.log('🤖 Using Gemini model:', modelName);
            const model = this.genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 2000,
                },
            });
            const prompt = `${systemPrompt}\n\nUser Request: ${userMessage}`;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const aiResponse = response.text();
            console.log('✅ Received response from Gemini');
            const fileOperations = this.parseFileOperations(aiResponse);
            const executionResults = await this.executeFileOperations(projectId, fileOperations);
            return {
                message: aiResponse,
                fileOperations: executionResults.operations,
                success: executionResults.success,
                error: executionResults.error
            };
        }
        catch (error) {
            console.error('Error processing chat message:', error);
            // Provide more specific error messages
            let errorMessage = 'Sorry, I encountered an error processing your request.';
            if (error instanceof Error) {
                if (error.message.includes('API key') || error.message.includes('PERMISSION_DENIED')) {
                    errorMessage = 'Please check your Gemini API key configuration. Make sure it\'s valid and has the necessary permissions.';
                }
                else if (error.message.includes('quota') || error.message.includes('limit') || error.message.includes('RESOURCE_EXHAUSTED')) {
                    errorMessage = 'API quota exceeded. Please wait a moment and try again. Free tier: 15 requests/minute, 1,500/day.';
                }
                else if (error.message.includes('model') || error.message.includes('404')) {
                    errorMessage = 'Model not available. Please check the GEMINI_SETUP.md guide for troubleshooting.';
                }
                else if (error.message.includes('INVALID_ARGUMENT')) {
                    errorMessage = 'Invalid request format. Please try rephrasing your request.';
                }
            }
            return {
                message: errorMessage,
                fileOperations: [],
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    createSystemPrompt(projectId, projectFiles) {
        const filesList = projectFiles.slice(0, 20).join('\n- ');
        return `You are an AI assistant that helps developers manage files in their cloud IDE project.

IMPORTANT: When you want to perform file operations, use this exact format:
[FILE_OPERATION]
action: create|edit|delete
path: relative/path/to/file
content: (file content for create/edit operations)
description: Brief description of what you're doing
[/FILE_OPERATION]

PROJECT INFO:
Project ID: ${projectId}
Existing files:
- ${filesList}

CRITICAL RULES FOR CODE GENERATION:
1. ALWAYS generate ACTUAL CODE, not the expected output
2. When asked to create a program that prints something, write the CODE that does the printing
3. For loops, write the loop syntax (for, while, etc.), not the repeated output
4. For functions, write the function definition, not what it returns
5. Always use forward slashes (/) in file paths
6. Paths should be relative to project root
7. For edit operations, provide complete new file content
8. Be careful with file paths - validate they make sense
9. Explain what you're doing before showing file operations

EXAMPLES:
- "Create a Python script to print hello 5 times" → Write: for i in range(5): print("hello")
- "Make a JavaScript function that adds two numbers" → Write: function add(a, b) { return a + b; }
- "Create a loop that counts to 10" → Write: for (let i = 1; i <= 10; i++) { console.log(i); }

DO NOT write the output/result - write the CODE that produces the output!

Respond naturally, explain your actions, then include file operations using the format above.`;
    }
    parseFileOperations(aiResponse) {
        console.log('🔍 Parsing AI response for file operations...');
        console.log('📄 AI Response:', aiResponse);
        const operations = [];
        const operationRegex = /\[FILE_OPERATION\]([\s\S]*?)\[\/FILE_OPERATION\]/g;
        let match;
        while ((match = operationRegex.exec(aiResponse)) !== null) {
            const operationText = match[1].trim();
            console.log('📋 Found operation block:', operationText);
            const lines = operationText.split('\n');
            let action = '';
            let path = '';
            let content = '';
            let description = '';
            let inContent = false;
            const contentLines = [];
            for (const line of lines) {
                if (line.startsWith('action:')) {
                    action = line.substring(7).trim();
                }
                else if (line.startsWith('path:')) {
                    path = line.substring(5).trim();
                }
                else if (line.startsWith('description:')) {
                    description = line.substring(12).trim();
                }
                else if (line.startsWith('content:')) {
                    inContent = true;
                    const contentStart = line.substring(8).trim();
                    if (contentStart && contentStart !== '|') {
                        contentLines.push(contentStart);
                    }
                }
                else if (inContent) {
                    contentLines.push(line);
                }
            }
            content = contentLines.join('\n').trim();
            console.log('✅ Parsed operation:', { action, path, contentLength: content.length, description });
            if (action && path && ['create', 'edit', 'delete', 'read'].includes(action)) {
                operations.push({
                    action: action,
                    path: path.replace(/^\/+/, ''),
                    content: content || undefined,
                    description: description || `${action} ${path}`
                });
            }
            else {
                console.log('❌ Invalid operation skipped:', { action, path, hasContent: !!content });
            }
        }
        console.log(`🎯 Total operations parsed: ${operations.length}`);
        return operations;
    }
    async executeFileOperations(projectId, operations) {
        const executedOperations = [];
        console.log('🔧 Executing file operations:', operations);
        try {
            for (const operation of operations) {
                console.log(`📝 Processing operation: ${operation.action} ${operation.path}`);
                switch (operation.action) {
                    case 'create':
                    case 'edit':
                        if (operation.content !== undefined) {
                            console.log(`💾 Creating CRDT file: ${operation.path} with content length: ${operation.content.length}`);
                            // Create a Yjs document with the content
                            const Y = await Promise.resolve().then(() => __importStar(require('yjs')));
                            const doc = new Y.Doc();
                            const ytext = doc.getText('monaco');
                            // Insert the content into the Yjs document
                            ytext.insert(0, operation.content);
                            // Get the CRDT state
                            const state = Y.encodeStateAsUpdate(doc);
                            // Save CRDT state to S3 (this is what the UI expects)
                            await this.s3Service.saveCRDTState(projectId, operation.path, state);
                            console.log(`✅ Successfully created CRDT file: ${operation.path} (${state.length} bytes)`);
                            executedOperations.push(operation);
                        }
                        else {
                            console.log(`❌ No content provided for: ${operation.path}`);
                        }
                        break;
                    case 'delete':
                        console.log(`🗑️ Deleting file: ${operation.path}`);
                        await this.s3Service.deleteFile(projectId, operation.path);
                        console.log(`✅ Successfully deleted: ${operation.path}`);
                        executedOperations.push(operation);
                        break;
                    case 'read':
                        console.log(`👁️ Read operation for: ${operation.path}`);
                        executedOperations.push(operation);
                        break;
                }
            }
            console.log(`✅ All operations completed successfully. Executed: ${executedOperations.length}/${operations.length}`);
            return { operations: executedOperations, success: true };
        }
        catch (error) {
            console.error('❌ Error executing file operations:', error);
            return {
                operations: executedOperations,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    getContentType(filePath) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const contentTypes = {
            'js': 'application/javascript',
            'ts': 'application/typescript',
            'tsx': 'application/typescript',
            'jsx': 'application/javascript',
            'json': 'application/json',
            'html': 'text/html',
            'css': 'text/css',
            'md': 'text/markdown',
            'txt': 'text/plain',
            'py': 'text/x-python',
        };
        return contentTypes[ext || ''] || 'text/plain';
    }
}
exports.ChatService = ChatService;
function getChatService() {
    return new ChatService();
}
