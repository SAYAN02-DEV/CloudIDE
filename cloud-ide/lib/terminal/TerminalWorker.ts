import { getSQSTerminalService, TerminalCommandMessage } from './SQSTerminalService';
import { getS3Service } from '../storage/S3Service';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export class TerminalWorker {
  private sqsService: ReturnType<typeof getSQSTerminalService>;
  private s3Service: ReturnType<typeof getS3Service>;
  private workspaceDir: string;
  private activeProcesses: Map<string, any>;

  constructor() {
    this.sqsService = getSQSTerminalService();
    this.s3Service = getS3Service();
    this.workspaceDir = '/tmp/workspaces';
    this.activeProcesses = new Map();
  }

  async initialize(): Promise<void> {
    await this.sqsService.initialize();
    
    // Create workspace directory
    await fs.mkdir(this.workspaceDir, { recursive: true });
    
    console.log('✅ Terminal Worker initialized');
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Terminal Worker...');
    
    await this.initialize();

    // Start processing commands from SQS
    await this.sqsService.processCommands(async (message) => {
      await this.handleCommand(message);
    });
  }

  private async handleCommand(message: TerminalCommandMessage): Promise<void> {
    const { projectId, terminalId, type } = message;

    console.log(`📥 Processing ${type} command for project ${projectId}, terminal ${terminalId}`);

    try {
      if (type === 'execute' && message.command) {
        await this.executeCommand(projectId, terminalId, message.command);
      } else if (type === 'resize' && message.cols && message.rows) {
        await this.resizeTerminal(projectId, terminalId, message.cols, message.rows);
      }
    } catch (error) {
      console.error('❌ Error handling command:', error);
      
      // Send error output back to user
      await this.sqsService.publishOutput(
        projectId,
        terminalId,
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`
      );
    }
  }

  private async executeCommand(
    projectId: string,
    terminalId: string,
    command: string
  ): Promise<void> {
    // 1. Download project from S3
    const projectPath = await this.downloadProjectFromS3(projectId);

    // 2. Execute command in project directory
    const fullCommand = command.trim();

    try {
      // Use spawn for better output streaming
      const proc = spawn(fullCommand, {
        shell: true,
        cwd: projectPath,
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      // Store process reference
      this.activeProcesses.set(`${projectId}:${terminalId}`, proc);

      // Stream stdout
      proc.stdout.on('data', async (data) => {
        await this.sqsService.publishOutput(
          projectId,
          terminalId,
          data.toString()
        );
      });

      // Stream stderr
      proc.stderr.on('data', async (data) => {
        await this.sqsService.publishOutput(
          projectId,
          terminalId,
          data.toString()
        );
      });

      // Handle process exit
      proc.on('close', async (code) => {
        this.activeProcesses.delete(`${projectId}:${terminalId}`);
        
        if (code !== 0) {
          await this.sqsService.publishOutput(
            projectId,
            terminalId,
            `\nProcess exited with code ${code}\n`
          );
        }

        // Upload any changed files back to S3
        await this.uploadProjectToS3(projectId, projectPath);
      });

      proc.on('error', async (error) => {
        await this.sqsService.publishOutput(
          projectId,
          terminalId,
          `Error executing command: ${error.message}\n`
        );
      });
    } catch (error) {
      throw error;
    }
  }

  private async resizeTerminal(
    projectId: string,
    terminalId: string,
    cols: number,
    rows: number
  ): Promise<void> {
    const processKey = `${projectId}:${terminalId}`;
    const proc = this.activeProcesses.get(processKey);

    if (proc && proc.resize) {
      proc.resize(cols, rows);
    }
  }

  private async downloadProjectFromS3(projectId: string): Promise<string> {
    const projectPath = path.join(this.workspaceDir, projectId);

    // Create project directory
    await fs.mkdir(projectPath, { recursive: true });

    // Download all files from S3
    const files = await this.s3Service.downloadProject(projectId);

    // Write files to disk
    for (const [filePath, content] of files.entries()) {
      const fullPath = path.join(projectPath, filePath);
      const dirPath = path.dirname(fullPath);

      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(fullPath, content);
    }

    console.log(`✅ Downloaded project ${projectId} from S3 to ${projectPath}`);
    return projectPath;
  }

  private async uploadProjectToS3(projectId: string, projectPath: string): Promise<void> {
    // Get all files in the project directory
    const files = await this.getAllFiles(projectPath);

    // Upload each file to S3
    const uploadPromises = files.map(async (filePath) => {
      const relativePath = path.relative(projectPath, filePath);
      const content = await fs.readFile(filePath);
      
      await this.s3Service.uploadFile(projectId, relativePath, content);
    });

    await Promise.all(uploadPromises);
    console.log(`✅ Uploaded project ${projectId} to S3`);
  }

  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and other common directories
        if (!['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
          files.push(...(await this.getAllFiles(fullPath)));
        }
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  async stop(): Promise<void> {
    // Kill all active processes
    for (const [key, proc] of this.activeProcesses.entries()) {
      proc.kill();
    }
    
    await this.sqsService.close();
    console.log('✅ Terminal Worker stopped');
  }
}

// Entry point for worker container
if (require.main === module) {
  const worker = new TerminalWorker();
  
  worker.start().catch((error) => {
    console.error('❌ Fatal error in Terminal Worker:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await worker.stop();
    process.exit(0);
  });
}
