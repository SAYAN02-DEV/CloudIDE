import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { getCRDTService } from '../crdt/CRDTService';
import { getS3Service } from '../storage/S3Service';
import { getSQSService } from '../queue/SQSService';
import { getDockerTerminalService } from '../terminal/DockerTerminalService';
import { createClient, RedisClientType } from 'redis';
import jwt from 'jsonwebtoken';

export interface CollaborationMessage {
  type: 'edit' | 'cursor' | 'selection' | 'presence';
  projectId: string;
  filePath: string;
  userId: string;
  username: string;
  data: any;
}

export interface TerminalMessage {
  type: 'command' | 'output' | 'resize';
  projectId: string;
  terminalId: string;
  userId: string;
  data: any;
}

export class WebSocketServer {
  private io: SocketIOServer;
  private httpServer: any;
  private crdtService: ReturnType<typeof getCRDTService>;
  private terminalService: ReturnType<typeof getDockerTerminalService>;
  private redisPub: RedisClientType;
  private redisSub: RedisClientType;
  private userSessions: Map<string, Set<string>>; // projectId -> Set of socketIds
  private saveTimeouts: Map<string, NodeJS.Timeout>; // fileKey -> timeout for debounced S3 save
  private socketSubscriptions: Map<string, Set<string>>; // socketId -> Set of fileKeys

  constructor(port: number = 8080) {
    this.httpServer = createServer();
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*', // Allow all origins in development
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true, // Enable compatibility mode
    });

    this.crdtService = getCRDTService();
    this.terminalService = getDockerTerminalService();
    
    console.log('Using Docker-based terminals');
    
    this.userSessions = new Map();
    this.saveTimeouts = new Map();
    this.socketSubscriptions = new Map();

    // Initialize Redis clients for terminal pub/sub
    this.redisPub = createClient({
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

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      
      console.log('Authentication attempt:', {
        hasToken: !!token,
        socketId: socket.id,
      });
      
      if (!token) {
        console.error('Authentication failed: No token provided');
        return next(new Error('Authentication error: No token provided'));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
        socket.data.userId = decoded.userId;
        socket.data.username = decoded.username;
        console.log('Authentication successful:', {
          userId: decoded.userId,
          username: decoded.username,
        });
        next();
      } catch (err) {
        console.error('Authentication failed: Invalid token', err);
        next(new Error('Authentication error: Invalid token'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id} (User: ${socket.data.username})`);

      // Join project room for collaboration
      socket.on('join-project', async (data: { projectId: string }) => {
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

        console.log(`User ${socket.data.username} joined project ${projectId}`);
      });

      socket.on('leave-project', async (data: { projectId: string }) => {
        const { projectId } = data;
        
        socket.leave(`project:${projectId}`);
        this.userSessions.get(projectId)?.delete(socket.id);

        socket.to(`project:${projectId}`).emit('user-left', {
          userId: socket.data.userId,
          username: socket.data.username,
          socketId: socket.id,
        });

        console.log(`User ${socket.data.username} left project ${projectId}`);
      });

      // Open file for collaboration
      socket.on('open-file', async (data: { projectId: string; filePath: string }) => {
        try {
          const { projectId, filePath } = data;
          
          console.log(`User ${socket.data.username} opening file ${filePath} in project ${projectId}`);
          
          socket.join(`file:${projectId}:${filePath}`);

          try {
            const s3Service = getS3Service();
            const s3State = await s3Service.loadCRDTState(projectId, filePath);
            
            if (s3State && s3State.length > 2) {
              console.log(`Loaded CRDT state from S3, size: ${s3State.length} bytes, syncing with Redis`);
              
              const doc = await this.crdtService.getDocument(projectId, filePath);
              const currentState = await this.crdtService.getDocumentState(projectId, filePath);
              
              if (currentState.length <= 2 || !this.arraysEqual(currentState, s3State)) {
                console.log(`Syncing Redis with S3 CRDT state...`);
                const Y = await import('yjs');
                Y.applyUpdate(doc, s3State);
                console.log(`Synced Redis CRDT with S3 state`);
              } else {
                console.log(`Redis already in sync with S3 CRDT state`);
              }
            } else {
              console.log(`No CRDT state in S3 for ${filePath}, using Redis state`);
            }
          } catch (s3Error: any) {
            if (s3Error?.name !== 'NoSuchKey' && !s3Error?.message?.includes('NoSuchKey')) {
              console.log(`S3 load failed:`, s3Error?.message || s3Error);
            } else {
              console.log(`File ${filePath} does not exist in S3 yet`);
            }
          }

          const docState = await this.crdtService.getDocumentState(projectId, filePath);
          
          socket.emit('file-opened', {
            projectId,
            filePath,
            state: Buffer.from(docState).toString('base64'),
          });
          
          console.log(`Sent CRDT state from Redis for ${filePath} (${docState.length} bytes)`);

          const fileKey = `${projectId}:${filePath}`;
          if (!this.socketSubscriptions.has(socket.id)) {
            this.socketSubscriptions.set(socket.id, new Set());
          }
          
          const socketSubs = this.socketSubscriptions.get(socket.id)!;
          
          if (!socketSubs.has(fileKey)) {
            console.log(`Creating new subscription for ${socket.id} to ${fileKey}`);
            
            await this.crdtService.subscribeToDocument(projectId, filePath, (update) => {
              console.log(`Broadcasting CRDT update for ${filePath} (${update.length} bytes)`);
              // Broadcast to all users in this file room EXCEPT the sender
              socket.to(`file:${projectId}:${filePath}`).emit('document-update', {
                projectId,
                filePath,
                update: Buffer.from(update).toString('base64'),
              });
            });
            
            socketSubs.add(fileKey);
          } else {
            console.log(`Subscription already exists for ${socket.id} to ${fileKey}`);
          }

          console.log(`File ${filePath} opened successfully for ${socket.data.username}`);
        } catch (error) {
          console.error('Error opening file:', error);
          socket.emit('error', { message: 'Failed to open file' });
        }
      });

      // Handle document edits
      socket.on('edit-document', async (data: {
        projectId: string;
        filePath: string;
        update: string; // base64 encoded update
      }) => {
        try {
          const { projectId, filePath, update } = data;
          
          console.log(`User ${socket.data.username} editing ${filePath}`);
          
          const updateBuffer = Buffer.from(update, 'base64');
          await this.crdtService.applyUpdate(projectId, filePath, updateBuffer);

          console.log(`CRDT update applied for ${filePath}`);
          
          const fileKey = `${projectId}:${filePath}`;
          
          if (this.saveTimeouts.has(fileKey)) {
            clearTimeout(this.saveTimeouts.get(fileKey)!);
          }
          
          const timeout = setTimeout(async () => {
            try {
              console.log(`Auto-saving CRDT state for ${filePath} to S3...`);
              
              const state = await this.crdtService.getDocumentState(projectId, filePath);
              
              const s3Service = getS3Service();
              await s3Service.saveCRDTState(projectId, filePath, state);
              
              console.log(`Auto-saved CRDT state to S3: ${filePath} (${state.length} bytes)`);
              this.saveTimeouts.delete(fileKey);
            } catch (saveError) {
              console.error(`Failed to auto-save CRDT state for ${filePath}:`, saveError);
            }
          }, 2000);
          
          this.saveTimeouts.set(fileKey, timeout);
        } catch (error) {
          console.error('Error applying document update:', error);
        }
      });

      // Handle cursor position updates
      socket.on('cursor-update', (data: {
        projectId: string;
        filePath: string;
        position: { line: number; column: number };
        selection?: { start: any; end: any };
      }) => {
        socket.to(`file:${data.projectId}:${data.filePath}`).emit('cursor-update', {
          userId: socket.data.userId,
          username: socket.data.username,
          ...data,
        });
      });

      // Terminal initialization - called when terminal component mounts
      socket.on('terminal-init', async (data: {
        projectId: string;
        terminalId: string;
      }) => {
        const { projectId, terminalId } = data;

        console.log(`Terminal initialized: ${projectId}:${terminalId}`);
        
        try {
          await this.terminalService.createSession(
            projectId,
            terminalId,
            socket.data.userId
          );

          const outputHandler = (output: { projectId: string; terminalId: string; data: string }) => {
            if (output.projectId === projectId && output.terminalId === terminalId) {
              socket.emit('terminal-output', {
                terminalId: output.terminalId,
                output: output.data,
              });
            }
          };

          this.terminalService.on('output', outputHandler);
          socket.data.terminalOutputHandler = outputHandler;

          socket.emit('terminal-ready', { terminalId });
          console.log(`Terminal session created: ${projectId}:${terminalId}`);
        } catch (error) {
          console.error('Error initializing terminal:', error);
          socket.emit('terminal-output', {
            terminalId,
            output: `Error: Failed to initialize terminal\n`,
          });
        }
      });

      // Terminal input - called when user types in terminal
      socket.on('terminal-input', async (data: {
        projectId: string;
        terminalId: string;
        data: string;
      }) => {
        const { projectId, terminalId, data: input } = data;

        try {
          await this.terminalService.writeToTerminal(projectId, terminalId, input);
        } catch (error) {
          console.error('Error writing to terminal:', error);
        }
      });

      socket.on('terminal-command', async (data: {
        projectId: string;
        terminalId: string;
        command: string;
      }) => {
        const { projectId, terminalId, command } = data;

        console.log(`Terminal command from ${socket.data.username}: ${command}`);
        
        try {
          await this.terminalService.writeToTerminal(projectId, terminalId, command + '\n');
        } catch (error) {
          console.error('Error sending command to terminal:', error);
          
          // Send error to client
          socket.emit('terminal-output', {
            terminalId,
            output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
          });
        }
      });

      // Terminal resize
      socket.on('terminal-resize', async (data: {
        projectId: string;
        terminalId: string;
        cols: number;
        rows: number;
      }) => {
        const { projectId, terminalId, cols, rows } = data;

        try {
          await this.terminalService.resizeTerminal(projectId, terminalId, cols, rows);
        } catch (error) {
          console.error('Error resizing terminal:', error);
        }
      });

      socket.on('terminal-close', async (data: {
        projectId: string;
        terminalId: string;
      }) => {
        const { projectId, terminalId } = data;

        console.log(`Terminal closed: ${projectId}:${terminalId}`);
        
        try {
          if (socket.data.terminalOutputHandler) {
            this.terminalService.off('output', socket.data.terminalOutputHandler);
            delete socket.data.terminalOutputHandler;
          }

          await this.terminalService.terminateSession(projectId, terminalId);
        } catch (error) {
          console.error('Error terminating terminal:', error);
        }
      });

      // Subscribe to terminal output for this project
      socket.on('subscribe-terminal', async (data: { projectId: string; terminalId: string }) => {
        const { projectId, terminalId } = data;
        socket.join(`terminal:${projectId}:${terminalId}`);
      });

      // Chat message - broadcast to project room
      socket.on('chat-message', async (data: {
        projectId: string;
        message: string;
        timestamp: Date;
      }) => {
        const { projectId, message, timestamp } = data;
        
        console.log(`Chat message from ${socket.data.username} in project ${projectId}: ${message}`);
        
        this.io.to(`project:${projectId}`).emit('chat-message', {
          userId: socket.data.userId,
          username: socket.data.username,
          message,
          timestamp,
        });
      });

      socket.on('ai-response', async (data: {
        projectId: string;
        message: string;
        fileOperations: Array<{
          action: string;
          path: string;
          description: string;
        }>;
        timestamp: Date;
      }) => {
        const { projectId, message, fileOperations, timestamp } = data;
        
        console.log(`AI response in project ${projectId} with ${fileOperations.length} file operations`);
        
        // Broadcast to all users in the project room
        this.io.to(`project:${projectId}`).emit('ai-response', {
          message,
          fileOperations,
          timestamp,
        });
      });

      socket.on('disconnect', async () => {
        console.log(`Client disconnected: ${socket.id}`);
        
        if (this.socketSubscriptions.has(socket.id)) {
          const fileKeys = this.socketSubscriptions.get(socket.id)!;
          for (const fileKey of fileKeys) {
            const [projectId, ...filePathParts] = fileKey.split(':');
            const filePath = filePathParts.join(':');
            console.log(`Unsubscribing ${socket.id} from ${fileKey}`);
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

  private async setupTerminalRedisSubscription(): Promise<void> {
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
        
        console.log(`Broadcasted terminal output to terminal:${projectId}:${terminalId}`);
      } catch (error) {
        console.error('Error processing terminal output:', error);
      }
    });
    
    console.log('Subscribed to terminal:*:* for terminal output');
  }

  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  async start(): Promise<void> {
    try {
      // Initialize services
      await this.crdtService.initialize();
      await this.terminalService.initialize();
      await this.redisPub.connect();
      await this.redisSub.connect();
      await this.setupTerminalRedisSubscription();
      
      const sqsService = getSQSService();
      await sqsService.initialize();

      const port = parseInt(process.env.WEBSOCKET_PORT || '8080');
      
      this.httpServer.listen(port, () => {
        console.log(`WebSocket server running on port ${port}`);
      });
    } catch (error) {
      console.error('Failed to start WebSocket server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.terminalService.cleanup();
    await this.crdtService.close();
    await this.redisPub.quit();
    await this.redisSub.quit();
    this.httpServer.close();
  }

  getIO(): SocketIOServer {
    return this.io;
  }
}

// Export singleton
let wsServer: WebSocketServer | null = null;

export const getWebSocketServer = (): WebSocketServer => {
  if (!wsServer) {
    wsServer = new WebSocketServer();
  }
  return wsServer;
};
