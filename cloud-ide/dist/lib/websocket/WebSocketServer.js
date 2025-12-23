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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebSocketServer = exports.WebSocketServer = void 0;
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const CRDTService_1 = require("../crdt/CRDTService");
const S3Service_1 = require("../storage/S3Service");
const SQSService_1 = require("../queue/SQSService");
const ECSTerminalService_1 = require("../terminal/ECSTerminalService");
const DockerTerminalService_1 = require("../terminal/DockerTerminalService");
const redis_1 = require("redis");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class WebSocketServer {
    constructor(port = 8080) {
        this.httpServer = (0, http_1.createServer)();
        this.io = new socket_io_1.Server(this.httpServer, {
            cors: {
                origin: '*', // Allow all origins in development
                methods: ['GET', 'POST'],
                credentials: true,
            },
            transports: ['websocket', 'polling'],
            allowEIO3: true, // Enable compatibility mode
        });
        this.crdtService = (0, CRDTService_1.getCRDTService)();
        // Auto-select terminal service based on environment
        const terminalMode = process.env.TERMINAL_MODE || 'docker';
        if (terminalMode === 'ecs') {
            console.log('🚀 Using ECS-based terminals (production mode)');
            this.terminalService = (0, ECSTerminalService_1.getECSTerminalService)();
        }
        else {
            console.log('🐳 Using Docker-based terminals (local development mode)');
            this.terminalService = (0, DockerTerminalService_1.getDockerTerminalService)();
        }
        this.userSessions = new Map();
        this.saveTimeouts = new Map();
        this.socketSubscriptions = new Map();
        // Initialize Redis clients for terminal pub/sub
        this.redisPub = (0, redis_1.createClient)({
            socket: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
            },
            password: process.env.REDIS_PASSWORD || undefined,
        });
        this.redisSub = this.redisPub.duplicate();
        this.setupMiddleware();
        this.setupEventHandlers();
    }
    setupMiddleware() {
        // Authentication middleware
        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            console.log('🔐 Authentication attempt:', {
                hasToken: !!token,
                socketId: socket.id,
            });
            if (!token) {
                console.error('❌ Authentication failed: No token provided');
                return next(new Error('Authentication error: No token provided'));
            }
            try {
                const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret');
                socket.data.userId = decoded.userId;
                socket.data.username = decoded.username;
                console.log('✅ Authentication successful:', {
                    userId: decoded.userId,
                    username: decoded.username,
                });
                next();
            }
            catch (err) {
                console.error('❌ Authentication failed: Invalid token', err);
                next(new Error('Authentication error: Invalid token'));
            }
        });
    }
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`✅ Client connected: ${socket.id} (User: ${socket.data.username})`);
            // Join project room for collaboration
            socket.on('join-project', async (data) => {
                const { projectId } = data;
                socket.join(`project:${projectId}`);
                if (!this.userSessions.has(projectId)) {
                    this.userSessions.set(projectId, new Set());
                }
                this.userSessions.get(projectId)?.add(socket.id);
                // Notify others about new user joining
                socket.to(`project:${projectId}`).emit('user-joined', {
                    userId: socket.data.userId,
                    username: socket.data.username,
                    socketId: socket.id,
                });
                console.log(`👤 User ${socket.data.username} joined project ${projectId}`);
            });
            // Leave project room
            socket.on('leave-project', async (data) => {
                const { projectId } = data;
                socket.leave(`project:${projectId}`);
                this.userSessions.get(projectId)?.delete(socket.id);
                socket.to(`project:${projectId}`).emit('user-left', {
                    userId: socket.data.userId,
                    username: socket.data.username,
                    socketId: socket.id,
                });
                console.log(`👤 User ${socket.data.username} left project ${projectId}`);
            });
            // Open file for collaboration
            socket.on('open-file', async (data) => {
                try {
                    const { projectId, filePath } = data;
                    console.log(`📄 User ${socket.data.username} opening file ${filePath} in project ${projectId}`);
                    socket.join(`file:${projectId}:${filePath}`);
                    // Load CRDT state from S3 and sync with Redis
                    try {
                        const s3Service = (0, S3Service_1.getS3Service)();
                        const s3State = await s3Service.loadCRDTState(projectId, filePath);
                        if (s3State && s3State.length > 2) {
                            console.log(`✅ Loaded CRDT state from S3, size: ${s3State.length} bytes, syncing with Redis`);
                            // Get or create document in Redis
                            const doc = await this.crdtService.getDocument(projectId, filePath);
                            // Get current state in Redis
                            const currentState = await this.crdtService.getDocumentState(projectId, filePath);
                            // Only update if states differ
                            if (currentState.length <= 2 || !this.arraysEqual(currentState, s3State)) {
                                console.log(`🔄 Syncing Redis with S3 CRDT state...`);
                                // Apply S3 state to Redis document
                                const Y = await Promise.resolve().then(() => __importStar(require('yjs')));
                                Y.applyUpdate(doc, s3State);
                                console.log(`✅ Synced Redis CRDT with S3 state`);
                            }
                            else {
                                console.log(`✅ Redis already in sync with S3 CRDT state`);
                            }
                        }
                        else {
                            console.log(`📭 No CRDT state in S3 for ${filePath}, using Redis state`);
                        }
                    }
                    catch (s3Error) {
                        if (s3Error?.name !== 'NoSuchKey' && !s3Error?.message?.includes('NoSuchKey')) {
                            console.log(`⚠️  S3 load failed:`, s3Error?.message || s3Error);
                        }
                        else {
                            console.log(`📭 File ${filePath} does not exist in S3 yet`);
                        }
                    }
                    // Get current CRDT state from Redis (now synced with S3)
                    const docState = await this.crdtService.getDocumentState(projectId, filePath);
                    socket.emit('file-opened', {
                        projectId,
                        filePath,
                        state: Buffer.from(docState).toString('base64'),
                    });
                    console.log(`📤 Sent CRDT state from Redis for ${filePath} (${docState.length} bytes)`);
                    // Check if this socket already has a subscription for this file
                    const fileKey = `${projectId}:${filePath}`;
                    if (!this.socketSubscriptions.has(socket.id)) {
                        this.socketSubscriptions.set(socket.id, new Set());
                    }
                    const socketSubs = this.socketSubscriptions.get(socket.id);
                    // Only subscribe if not already subscribed
                    if (!socketSubs.has(fileKey)) {
                        console.log(`🔔 Creating new subscription for ${socket.id} to ${fileKey}`);
                        // Subscribe to document updates
                        await this.crdtService.subscribeToDocument(projectId, filePath, (update) => {
                            console.log(`🔄 Broadcasting CRDT update for ${filePath} (${update.length} bytes)`);
                            // Broadcast to all users in this file room EXCEPT the sender
                            socket.to(`file:${projectId}:${filePath}`).emit('document-update', {
                                projectId,
                                filePath,
                                update: Buffer.from(update).toString('base64'),
                            });
                        });
                        socketSubs.add(fileKey);
                    }
                    else {
                        console.log(`⏭️  Subscription already exists for ${socket.id} to ${fileKey}`);
                    }
                    console.log(`✅ File ${filePath} opened successfully for ${socket.data.username}`);
                }
                catch (error) {
                    console.error('❌ Error opening file:', error);
                    socket.emit('error', { message: 'Failed to open file' });
                }
            });
            // Handle document edits
            socket.on('edit-document', async (data) => {
                try {
                    const { projectId, filePath, update } = data;
                    console.log(`✏️  User ${socket.data.username} editing ${filePath}`);
                    const updateBuffer = Buffer.from(update, 'base64');
                    await this.crdtService.applyUpdate(projectId, filePath, updateBuffer);
                    console.log(`✅ CRDT update applied for ${filePath}`);
                    // Debounced save CRDT state to S3 (wait 2 seconds after last edit)
                    const fileKey = `${projectId}:${filePath}`;
                    if (this.saveTimeouts.has(fileKey)) {
                        clearTimeout(this.saveTimeouts.get(fileKey));
                    }
                    const timeout = setTimeout(async () => {
                        try {
                            console.log(`💾 Auto-saving CRDT state for ${filePath} to S3...`);
                            // Get current CRDT state from Redis
                            const state = await this.crdtService.getDocumentState(projectId, filePath);
                            // Save CRDT state (binary) to S3
                            const s3Service = (0, S3Service_1.getS3Service)();
                            await s3Service.saveCRDTState(projectId, filePath, state);
                            console.log(`✅ Auto-saved CRDT state to S3: ${filePath} (${state.length} bytes)`);
                            this.saveTimeouts.delete(fileKey);
                        }
                        catch (saveError) {
                            console.error(`❌ Failed to auto-save CRDT state for ${filePath}:`, saveError);
                        }
                    }, 2000);
                    this.saveTimeouts.set(fileKey, timeout);
                    // Broadcast will happen automatically through CRDT service subscription
                }
                catch (error) {
                    console.error('❌ Error applying document update:', error);
                }
            });
            // Handle cursor position updates
            socket.on('cursor-update', (data) => {
                socket.to(`file:${data.projectId}:${data.filePath}`).emit('cursor-update', {
                    userId: socket.data.userId,
                    username: socket.data.username,
                    ...data,
                });
            });
            // Terminal initialization - called when terminal component mounts
            socket.on('terminal-init', async (data) => {
                const { projectId, terminalId } = data;
                console.log(`🖥️  Terminal initialized: ${projectId}:${terminalId}`);
                try {
                    // Create persistent terminal session
                    await this.terminalService.createSession(projectId, terminalId, socket.data.userId);
                    // Setup output handler for this session
                    const outputHandler = (output) => {
                        if (output.projectId === projectId && output.terminalId === terminalId) {
                            socket.emit('terminal-output', {
                                terminalId: output.terminalId,
                                output: output.data,
                            });
                        }
                    };
                    this.terminalService.on('output', outputHandler);
                    // Store handler for cleanup
                    socket.data.terminalOutputHandler = outputHandler;
                    socket.emit('terminal-ready', { terminalId });
                    console.log(`✅ Terminal session created: ${projectId}:${terminalId}`);
                }
                catch (error) {
                    console.error('❌ Error initializing terminal:', error);
                    socket.emit('terminal-output', {
                        terminalId,
                        output: `Error: Failed to initialize terminal\n`,
                    });
                }
            });
            // Terminal input - called when user types in terminal
            socket.on('terminal-input', async (data) => {
                const { projectId, terminalId, data: input } = data;
                try {
                    await this.terminalService.writeToTerminal(projectId, terminalId, input);
                }
                catch (error) {
                    console.error('❌ Error writing to terminal:', error);
                }
            });
            // Terminal command (for backwards compatibility)
            socket.on('terminal-command', async (data) => {
                const { projectId, terminalId, command } = data;
                console.log(`⌨️  Terminal command from ${socket.data.username}: ${command}`);
                try {
                    // Write command + newline to terminal
                    await this.terminalService.writeToTerminal(projectId, terminalId, command + '\n');
                }
                catch (error) {
                    console.error('❌ Error sending command to terminal:', error);
                    // Send error to client
                    socket.emit('terminal-output', {
                        terminalId,
                        output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
                    });
                }
            });
            // Terminal resize
            socket.on('terminal-resize', async (data) => {
                const { projectId, terminalId, cols, rows } = data;
                try {
                    await this.terminalService.resizeTerminal(projectId, terminalId, cols, rows);
                }
                catch (error) {
                    console.error('❌ Error resizing terminal:', error);
                }
            });
            // Terminal termination - called when terminal component unmounts
            socket.on('terminal-close', async (data) => {
                const { projectId, terminalId } = data;
                console.log(`❌ Terminal closed: ${projectId}:${terminalId}`);
                try {
                    // Remove output handler
                    if (socket.data.terminalOutputHandler) {
                        this.terminalService.off('output', socket.data.terminalOutputHandler);
                        delete socket.data.terminalOutputHandler;
                    }
                    // Terminate session
                    await this.terminalService.terminateSession(projectId, terminalId);
                }
                catch (error) {
                    console.error('❌ Error terminating terminal:', error);
                }
            });
            // Subscribe to terminal output for this project
            socket.on('subscribe-terminal', async (data) => {
                const { projectId, terminalId } = data;
                socket.join(`terminal:${projectId}:${terminalId}`);
            });
            // Chat message - broadcast to project room
            socket.on('chat-message', async (data) => {
                const { projectId, message, timestamp } = data;
                console.log(`💬 Chat message from ${socket.data.username} in project ${projectId}: ${message}`);
                // Broadcast to all users in the project room
                this.io.to(`project:${projectId}`).emit('chat-message', {
                    userId: socket.data.userId,
                    username: socket.data.username,
                    message,
                    timestamp,
                });
            });
            // AI response - broadcast to project room
            socket.on('ai-response', async (data) => {
                const { projectId, message, fileOperations, timestamp } = data;
                console.log(`🤖 AI response in project ${projectId} with ${fileOperations.length} file operations`);
                // Broadcast to all users in the project room
                this.io.to(`project:${projectId}`).emit('ai-response', {
                    message,
                    fileOperations,
                    timestamp,
                });
            });
            // Disconnect
            socket.on('disconnect', async () => {
                console.log(`❌ Client disconnected: ${socket.id}`);
                // Clean up subscriptions
                if (this.socketSubscriptions.has(socket.id)) {
                    const fileKeys = this.socketSubscriptions.get(socket.id);
                    for (const fileKey of fileKeys) {
                        const [projectId, ...filePathParts] = fileKey.split(':');
                        const filePath = filePathParts.join(':');
                        console.log(`🧹 Unsubscribing ${socket.id} from ${fileKey}`);
                        await this.crdtService.unsubscribeFromDocument(projectId, filePath);
                    }
                    this.socketSubscriptions.delete(socket.id);
                }
                // Clean up user sessions
                for (const [projectId, socketIds] of this.userSessions.entries()) {
                    if (socketIds.has(socket.id)) {
                        socketIds.delete(socket.id);
                        this.io.to(`project:${projectId}`).emit('user-left', {
                            userId: socket.data.userId,
                            username: socket.data.username,
                            socketId: socket.id,
                        });
                    }
                }
            });
        });
    }
    async setupTerminalRedisSubscription() {
        // Subscribe to terminal output from workers using pattern matching
        await this.redisSub.pSubscribe('terminal:*:*', (message, channel) => {
            try {
                const data = JSON.parse(message);
                const { projectId, terminalId, output } = data;
                // Broadcast terminal output to all connected clients in that terminal room
                this.io.to(`terminal:${projectId}:${terminalId}`).emit('terminal-output', {
                    terminalId,
                    output,
                });
                console.log(`📡 Broadcasted terminal output to terminal:${projectId}:${terminalId}`);
            }
            catch (error) {
                console.error('Error processing terminal output:', error);
            }
        });
        console.log('✅ Subscribed to terminal:*:* for terminal output');
    }
    arraysEqual(a, b) {
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i])
                return false;
        }
        return true;
    }
    async start() {
        try {
            // Initialize services
            await this.crdtService.initialize();
            await this.terminalService.initialize();
            await this.redisPub.connect();
            await this.redisSub.connect();
            await this.setupTerminalRedisSubscription();
            // Initialize SQS service (creates queue if needed)
            const sqsService = (0, SQSService_1.getSQSService)();
            await sqsService.initialize();
            const port = parseInt(process.env.WEBSOCKET_PORT || '8080');
            this.httpServer.listen(port, () => {
                console.log(`🚀 WebSocket server running on port ${port}`);
            });
        }
        catch (error) {
            console.error('❌ Failed to start WebSocket server:', error);
            throw error;
        }
    }
    async stop() {
        await this.terminalService.cleanup();
        await this.crdtService.close();
        await this.redisPub.quit();
        await this.redisSub.quit();
        this.httpServer.close();
    }
    getIO() {
        return this.io;
    }
}
exports.WebSocketServer = WebSocketServer;
// Export singleton
let wsServer = null;
const getWebSocketServer = () => {
    if (!wsServer) {
        wsServer = new WebSocketServer();
    }
    return wsServer;
};
exports.getWebSocketServer = getWebSocketServer;
