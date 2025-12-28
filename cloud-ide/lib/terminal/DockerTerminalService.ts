import * as pty from 'node-pty';
import { getS3Service } from '../storage/S3Service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as Y from 'yjs';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';

export interface TerminalSession {
  projectId: string;
  terminalId: string;
  userId: string;
  containerId: string;
  containerName: string;
  ptyProcess: pty.IPty;
  workspacePath: string;
  createdAt: number;
  lastActivityAt: number;
}

export class DockerTerminalService extends EventEmitter {
  private sessions: Map<string, TerminalSession> = new Map();
  private s3Service: ReturnType<typeof getS3Service>;
  private workspaceRoot: string = '/tmp/cloudide-workspaces';

  constructor() {
    super();
    this.s3Service = getS3Service();
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.workspaceRoot, { recursive: true });
    
    try {
      await this.execCommand('docker --version');
      console.log('Docker Terminal Service initialized');
    } catch (error) {
      throw new Error('Docker is not available. Please install Docker to use terminal features.');
    }
  }

  private getSessionKey(projectId: string, terminalId: string): string {
    return `${projectId}:${terminalId}`;
  }

  /**
   * Create a new terminal session in an isolated Docker container
   */
  async createSession(
    projectId: string,
    terminalId: string,
    userId: string
  ): Promise<TerminalSession> {
    const sessionKey = this.getSessionKey(projectId, terminalId);

    if (this.sessions.has(sessionKey)) {
      console.log(`Reusing existing session: ${sessionKey}`);
      return this.sessions.get(sessionKey)!;
    }

    const workspacePath = await this.prepareWorkspace(projectId);

    const containerName = `cloudide-${projectId}-${terminalId}`.replace(/[^a-zA-Z0-9_-]/g, '-');
    
    try {
      const dockerCommand = [
        'docker', 'run',
        '-dit',
        '--name', containerName,
        '--rm',
        '--network', 'none',
        '-v', `${workspacePath}:/workspace`,
        '-w', '/workspace',
        '--memory', '512m',
        '--cpus', '1',
        '--user', '1000:1000',
        'cloudide-terminal:latest',
        'bash'
      ].join(' ');

      const result = await this.execCommand(dockerCommand);
      const containerId = result.trim();

      console.log(`Created Docker container: ${containerName} (${containerId.substring(0, 12)})`);

      const ptyProcess = pty.spawn('docker', ['exec', '-it', containerId, 'bash'], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: process.env,
      });

      const session: TerminalSession = {
        projectId,
        terminalId,
        userId,
        containerId,
        containerName,
        ptyProcess,
        workspacePath,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      this.sessions.set(sessionKey, session);

      ptyProcess.onData((data) => {
        session.lastActivityAt = Date.now();
        this.emit('output', {
          projectId,
          terminalId,
          data,
        });
      });

      ptyProcess.onExit((exitCode) => {
        console.log(`PTY process exited for ${sessionKey} with code ${exitCode.exitCode}`);
        this.terminateSession(projectId, terminalId);
      });

      console.log(`Created isolated terminal session in container: ${sessionKey}`);
      return session;
    } catch (error) {
      console.error('Error creating Docker container:', error);
      throw error;
    }
  }

  async writeToTerminal(
    projectId: string,
    terminalId: string,
    data: string
  ): Promise<void> {
    const sessionKey = this.getSessionKey(projectId, terminalId);
    const session = this.sessions.get(sessionKey);

    if (!session) {
      throw new Error(`Terminal session not found: ${sessionKey}`);
    }

    session.lastActivityAt = Date.now();
    session.ptyProcess.write(data);
  }

  async resizeTerminal(
    projectId: string,
    terminalId: string,
    cols: number,
    rows: number
  ): Promise<void> {
    const sessionKey = this.getSessionKey(projectId, terminalId);
    const session = this.sessions.get(sessionKey);

    if (session) {
      session.ptyProcess.resize(cols, rows);
    }
  }

  async terminateSession(projectId: string, terminalId: string): Promise<void> {
    const sessionKey = this.getSessionKey(projectId, terminalId);
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return;
    }

    try {
      session.ptyProcess.kill();
    } catch (error) {
      console.error('Error killing PTY process:', error);
    }

    try {
      await this.execCommand(`docker stop ${session.containerId}`);
      console.log(`Stopped Docker container: ${session.containerName}`);
    } catch (error) {
      console.error('Error stopping container:', error);
    }

    try {
      await this.syncWorkspaceToS3(projectId, session.workspacePath);
    } catch (error) {
      console.error('Error syncing workspace to S3:', error);
    }

    this.sessions.delete(sessionKey);
    console.log(`Terminated terminal session: ${sessionKey}`);
  }

  getSession(projectId: string, terminalId: string): TerminalSession | undefined {
    const sessionKey = this.getSessionKey(projectId, terminalId);
    return this.sessions.get(sessionKey);
  }

  private execCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, {
        shell: true,
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
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed: ${stderr || stdout}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async prepareWorkspace(projectId: string): Promise<string> {
    const workspacePath = path.join(this.workspaceRoot, projectId);

    try {
      await fs.mkdir(workspacePath, { recursive: true });

      const files = await this.s3Service.listCRDTFiles(projectId);

      console.log(`Downloading ${files.length} files for project ${projectId}`);

      for (const file of files) {
        await this.downloadAndConvertFile(projectId, file.key, workspacePath);
      }

      console.log(`Workspace prepared: ${workspacePath}`);
      return workspacePath;
    } catch (error) {
      console.error('Error preparing workspace:', error);
      throw error;
    }
  }

  private async downloadAndConvertFile(
    projectId: string,
    filePath: string,
    workspacePath: string
  ) {
    try {
      const crdtState = await this.s3Service.loadCRDTState(projectId, filePath);

      if (!crdtState || crdtState.length <= 2) {
        const fullPath = path.join(workspacePath, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, '');
        return;
      }

      const doc = new Y.Doc();
      Y.applyUpdate(doc, crdtState);
      const ytext = doc.getText('monaco');
      const content = ytext.toString();

      const fullPath = path.join(workspacePath, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);

      console.log(`Converted file: ${filePath} (${content.length} bytes)`);
    } catch (error) {
      console.error(`Error converting file ${filePath}:`, error);
    }
  }

  private async syncWorkspaceToS3(projectId: string, workspacePath: string): Promise<void> {
    try {
      const { files, folders } = await this.scanDirectory(workspacePath, workspacePath);
      
      console.log(`Syncing ${files.length} files to S3...`);

      for (const folderPath of folders) {
        await this.s3Service.createCRDTFolder(projectId, folderPath);
      }

      for (const filePath of files) {
        await this.uploadFileToCRDT(projectId, filePath, workspacePath);
      }

      console.log(`Workspace synced to S3`);
    } catch (error) {
      console.error('Error syncing workspace to S3:', error);
    }
  }

  private async scanDirectory(
    dirPath: string,
    rootPath: string
  ): Promise<{ files: string[]; folders: string[] }> {
    const files: string[] = [];
    const folders: string[] = [];

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (['node_modules', '.git', '.next', 'dist', 'build', '__pycache__'].includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        const relativePath = path.relative(rootPath, fullPath);
        folders.push(relativePath);

        const subResults = await this.scanDirectory(fullPath, rootPath);
        files.push(...subResults.files);
        folders.push(...subResults.folders);
      } else {
        files.push(fullPath);
      }
    }

    return { files, folders };
  }

  private async uploadFileToCRDT(
    projectId: string,
    filePath: string,
    workspacePath: string
  ): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(workspacePath, filePath);

      const doc = new Y.Doc();
      const ytext = doc.getText('monaco');
      ytext.insert(0, content);

      const state = Y.encodeStateAsUpdate(doc);
      await this.s3Service.saveCRDTState(projectId, relativePath, state);
    } catch (error) {
      console.error(`Error uploading file ${filePath}:`, error);
    }
  }

  async cleanup(): Promise<void> {
    for (const [key, session] of this.sessions.entries()) {
      await this.terminateSession(session.projectId, session.terminalId);
    }
  }
}

// Singleton instance
let terminalService: DockerTerminalService | null = null;

export function getDockerTerminalService(): DockerTerminalService {
  if (!terminalService) {
    terminalService = new DockerTerminalService();
  }
  return terminalService;
}
