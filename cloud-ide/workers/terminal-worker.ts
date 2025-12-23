import { config } from 'dotenv';
config(); // Load environment variables from .env file

import { getSQSService, TerminalCommand } from '../lib/queue/SQSService';
import { getS3Service } from '../lib/storage/S3Service';
import { createClient, RedisClientType } from 'redis';
import { spawn, ChildProcess } from 'child_process';
import * as Y from 'yjs';
import * as fs from 'fs/promises';
import * as path from 'path';

// Interface to track terminal sessions
interface TerminalSession {
  projectId: string;
  terminalId: string;
  workspacePath: string;
  currentProcess?: ChildProcess;
  createdAt: number;
  lastActivityAt: number;
}

export class TerminalWorker {
  private sqsService: ReturnType<typeof getSQSService>;
  private s3Service: ReturnType<typeof getS3Service>;
  private redisPub: RedisClientType;
  private isRunning: boolean = false;
  private workspaceRoot: string = '/tmp/cloudide-workspaces';
  private activeSessions: Map<string, TerminalSession> = new Map(); // sessionKey -> TerminalSession

  constructor() {
    this.sqsService = getSQSService();
    this.s3Service = getS3Service();
    
    // Only use Redis if configured
    if (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost') {
      this.redisPub = createClient({
        socket: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        password: process.env.REDIS_PASSWORD || undefined,
      });
    } else {
      console.warn('⚠️  Redis not configured, output will be stored in S3 only');
    }
  }

  async initialize() {
    if (this.redisPub) {
      await this.redisPub.connect();
    }
    await fs.mkdir(this.workspaceRoot, { recursive: true });
    console.log('✅ Terminal Worker initialized with persistent sessions');
  }

  private getSessionKey(projectId: string, terminalId: string): string {
    return `${projectId}:${terminalId}`;
  }

  /**
   * Start processing commands from SQS queue
   */
  async start() {
    this.isRunning = true;
    console.log('🚀 Terminal Worker started, initializing SQS...');
    
    // Initialize SQS service (creates queue if needed)
    await this.sqsService.initialize();
    
    console.log('📡 Polling SQS queue for commands...');
    console.log(`🔍 USE_LOCALSTACK: ${process.env.USE_LOCALSTACK}`);
    console.log(`🔍 Queue polling every 20 seconds...`);

    while (this.isRunning) {
      try {
        const messages = await this.sqsService.receiveCommands(1);

        for (const { command, receiptHandle } of messages) {
          await this.processCommand(command);
          await this.sqsService.deleteCommand(receiptHandle);
        }
      } catch (error) {
        console.error('❌ Error in worker loop:', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s on error
      }
    }
  }

  /**
   * Stop the worker
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Terminal Worker stopping...');
  }

  /**
   * Process a terminal command
   */
  private async processCommand(command: TerminalCommand) {
    const { projectId, terminalId, userId, username, command: cmd } = command;
    
    console.log(`⚙️  Processing command from ${username}: ${cmd}`);

    try {
      const sessionKey = this.getSessionKey(projectId, terminalId);
      let session = this.activeSessions.get(sessionKey);

      // If session doesn't exist, create it
      if (!session) {
        console.log(`📦 Creating new session for ${sessionKey}`);
        const workspacePath = await this.prepareWorkspace(projectId);
        session = {
          projectId,
          terminalId,
          workspacePath,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
        };
        this.activeSessions.set(sessionKey, session);
        await this.publishOutput(projectId, terminalId, `Session initialized for ${projectId}\n`);
      } else {
        console.log(`♻️  Reusing existing session for ${sessionKey}`);
        session.lastActivityAt = Date.now();
      }

      // Execute command in the persistent workspace
      await this.executeCommandInSession(session, cmd);

      console.log(`✅ Command executed successfully: ${cmd}`);
    } catch (error: any) {
      console.error(`❌ Error processing command: ${cmd}`, error);
      await this.publishOutput(
        projectId, 
        terminalId, 
        `Error: ${error.message || 'Command failed'}\n`
      );
    }
  }

  /**
   * Execute command in an existing session
   */
  private async executeCommandInSession(session: TerminalSession, cmd: string): Promise<void> {
    const { projectId, terminalId, workspacePath } = session;

    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, [], {
        cwd: workspacePath,
        shell: true,
        env: {
          ...process.env,
          HOME: workspacePath,
          PWD: workspacePath,
        },
      });

      // Store current process
      session.currentProcess = proc;

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', async (data) => {
        const output = data.toString();
        stdout += output;
        await this.publishOutput(projectId, terminalId, output);
      });

      proc.stderr.on('data', async (data) => {
        const output = data.toString();
        stderr += output;
        await this.publishOutput(projectId, terminalId, output);
      });

      proc.on('close', async (code) => {
        session.currentProcess = undefined;
        
        if (code !== 0 && !stdout && !stderr) {
          await this.publishOutput(projectId, terminalId, `Process exited with code ${code}\n`);
        }

        // Sync workspace changes back to S3
        try {
          await this.syncWorkspaceToS3(projectId, workspacePath);
        } catch (error) {
          console.error('❌ Error syncing workspace to S3:', error);
        }

        resolve();
      });

      proc.on('error', async (error) => {
        await this.publishOutput(projectId, terminalId, `Error: ${error.message}\n`);
        reject(error);
      });
    });
  }

  /**
   * Prepare workspace by downloading files from S3
   */
  private async prepareWorkspace(projectId: string): Promise<string> {
    const workspacePath = path.join(this.workspaceRoot, projectId);

    try {
      // Create workspace directory
      await fs.mkdir(workspacePath, { recursive: true });

      // List all CRDT files for this project
      const files = await this.s3Service.listCRDTFiles(projectId);

      console.log(`📥 Downloading ${files.length} files for project ${projectId}`);

      // Download and convert each CRDT file to actual file
      for (const file of files) {
        await this.downloadAndConvertFile(projectId, file.key, workspacePath);
      }

      console.log(`✅ Workspace prepared: ${workspacePath}`);
      return workspacePath;
    } catch (error) {
      console.error('❌ Error preparing workspace:', error);
      throw error;
    }
  }

  /**
   * Download CRDT state from S3 and convert to actual file
   */
  private async downloadAndConvertFile(
    projectId: string,
    filePath: string,
    workspacePath: string
  ) {
    try {
      // Load CRDT state from S3
      const crdtState = await this.s3Service.loadCRDTState(projectId, filePath);

      if (!crdtState || crdtState.length <= 2) {
        // Empty file, create empty file
        const fullPath = path.join(workspacePath, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, '');
        return;
      }

      // Convert CRDT to plain text
      const doc = new Y.Doc();
      Y.applyUpdate(doc, crdtState);
      const ytext = doc.getText('monaco');
      const content = ytext.toString();

      // Write to filesystem
      const fullPath = path.join(workspacePath, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);

      console.log(`✅ Converted file: ${filePath} (${content.length} bytes)`);
    } catch (error) {
      console.error(`❌ Error converting file ${filePath}:`, error);
    }
  }

  /**
   * Publish output to Redis for WebSocket broadcasting
   */
  private async publishOutput(
    projectId: string,
    terminalId: string,
    output: string
  ): Promise<void> {
    try {
      if (this.redisPub) {
        await this.redisPub.publish(
          `terminal:${projectId}:${terminalId}`,
          JSON.stringify({
            type: 'output',
            projectId,
            terminalId,
            output,
            timestamp: Date.now(),
          })
        );
        console.log(`📡 Published output to Redis: terminal:${projectId}:${terminalId}`);
      } else {
        console.log(`📝 Output (Redis disabled): ${output.substring(0, 100)}...`);
      }
    } catch (error) {
      console.error('❌ Error publishing output to Redis:', error);
    }
  }

  /**
   * Sync workspace changes back to S3 (for mkdir, touch, rm, etc.)
   */
  private async syncWorkspaceToS3(projectId: string, workspacePath: string): Promise<void> {
    try {
      // Recursively scan workspace directory
      const { files, folders } = await this.scanDirectory(workspacePath, workspacePath);
      
      console.log(`🔄 Syncing ${files.length} files and ${folders.length} folders to S3...`);

      // Upload folders as markers
      for (const folderPath of folders) {
        await this.s3Service.createCRDTFolder(projectId, folderPath);
      }

      // Upload each file as CRDT state
      for (const filePath of files) {
        await this.uploadFileToCRDT(projectId, filePath, workspacePath);
      }

      console.log(`✅ Workspace synced to S3`);
    } catch (error) {
      console.error('❌ Error syncing workspace to S3:', error);
    }
  }

  /**
   * Recursively scan directory for files and folders
   */
  private async scanDirectory(dir: string, rootPath: string): Promise<{ files: string[]; folders: string[] }> {
    const files: string[] = [];
    const folders: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(rootPath, fullPath);

        if (entry.isDirectory()) {
          // Skip node_modules, .git, etc.
          if (['.git', 'node_modules', '.next', 'dist', 'build'].includes(entry.name)) {
            continue;
          }
          
          folders.push(relativePath);
          const subResult = await this.scanDirectory(fullPath, rootPath);
          files.push(...subResult.files);
          folders.push(...subResult.folders);
        } else if (entry.isFile()) {
          files.push(relativePath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }

    return { files, folders };
  }

  /**
   * Upload a file to S3 as CRDT state
   */
  private async uploadFileToCRDT(
    projectId: string,
    filePath: string,
    workspacePath: string
  ): Promise<void> {
    try {
      const fullPath = path.join(workspacePath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');

      // Convert to CRDT format
      const doc = new Y.Doc();
      const ytext = doc.getText('monaco');
      ytext.insert(0, content);
      const state = Y.encodeStateAsUpdate(doc);

      // Save to S3
      await this.s3Service.saveCRDTState(projectId, filePath, state);
    } catch (error) {
      console.error(`❌ Error uploading file ${filePath} to CRDT:`, error);
    }
  }

  async shutdown() {
    this.stop();
    await this.redisPub.quit();
    console.log('✅ Terminal Worker shut down');
  }
}

// CLI entry point for running worker
if (require.main === module) {
  const worker = new TerminalWorker();
  
  worker.initialize().then(() => {
    worker.start();
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await worker.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await worker.shutdown();
    process.exit(0);
  });
}
