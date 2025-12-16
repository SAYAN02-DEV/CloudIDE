import { config } from 'dotenv';
config(); // Load environment variables from .env file

import { getSQSService, TerminalCommand } from '../lib/queue/SQSService';
import { getS3Service } from '../lib/storage/S3Service';
import { createClient, RedisClientType } from 'redis';
import { spawn } from 'child_process';
import * as Y from 'yjs';
import * as fs from 'fs/promises';
import * as path from 'path';

export class TerminalWorker {
  private sqsService: ReturnType<typeof getSQSService>;
  private s3Service: ReturnType<typeof getS3Service>;
  private redisPub: RedisClientType;
  private isRunning: boolean = false;
  private workspaceRoot: string = '/tmp/cloudide-workspaces';

  constructor() {
    this.sqsService = getSQSService();
    this.s3Service = getS3Service();
    
    this.redisPub = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });
  }

  async initialize() {
    await this.redisPub.connect();
    await fs.mkdir(this.workspaceRoot, { recursive: true });
    console.log('✅ Terminal Worker initialized');
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
      // 1. Prepare workspace for this project
      const workspacePath = await this.prepareWorkspace(projectId);

      // 2. Execute command in workspace
      const output = await this.executeCommand(cmd, workspacePath);

      // 3. Sync workspace changes back to S3
      await this.syncWorkspaceToS3(projectId, workspacePath);

      // 4. Send output via Redis Pub/Sub
      await this.publishOutput(projectId, terminalId, output);

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
   * Execute command in workspace
   */
  private async executeCommand(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, [], {
        cwd,
        shell: true,
        env: {
          ...process.env,
          HOME: cwd,
          PWD: cwd,
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 || stdout || stderr) {
          resolve(stdout + stderr);
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error('Command timeout (30s)'));
      }, 30000);
    });
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
