import * as pty from 'node-pty';
import { getS3Service } from '../storage/S3Service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as Y from 'yjs';
import { EventEmitter } from 'events';

export interface TerminalSession {
  projectId: string;
  terminalId: string;
  userId: string;
  ptyProcess: pty.IPty;
  workspacePath: string;
  createdAt: number;
  lastActivityAt: number;
}

export class PersistentTerminalService extends EventEmitter {
  private sessions: Map<string, TerminalSession> = new Map();
  private s3Service: ReturnType<typeof getS3Service>;
  private workspaceRoot: string = '/tmp/cloudide-workspaces';

  constructor() {
    super();
    this.s3Service = getS3Service();
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.workspaceRoot, { recursive: true });
    console.log('✅ Persistent Terminal Service initialized');
  }

  private getSessionKey(projectId: string, terminalId: string): string {
    return `${projectId}:${terminalId}`;
  }

  /**
   * Create a new terminal session with persistent PTY
   */
  async createSession(
    projectId: string,
    terminalId: string,
    userId: string
  ): Promise<TerminalSession> {
    const sessionKey = this.getSessionKey(projectId, terminalId);

    // Check if session already exists
    if (this.sessions.has(sessionKey)) {
      console.log(`♻️  Reusing existing session: ${sessionKey}`);
      return this.sessions.get(sessionKey)!;
    }

    // Prepare workspace
    const workspacePath = await this.prepareWorkspace(projectId);

    // Create persistent PTY process
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: workspacePath,
      env: {
        ...process.env,
        HOME: workspacePath,
        PWD: workspacePath,
      },
    });

    // Create session
    const session: TerminalSession = {
      projectId,
      terminalId,
      userId,
      ptyProcess,
      workspacePath,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.sessions.set(sessionKey, session);

    // Handle PTY output
    ptyProcess.onData((data) => {
      session.lastActivityAt = Date.now();
      this.emit('output', {
        projectId,
        terminalId,
        data,
      });
    });

    // Handle PTY exit
    ptyProcess.onExit((exitCode) => {
      console.log(`🔴 PTY process exited for ${sessionKey} with code ${exitCode.exitCode}`);
      this.terminateSession(projectId, terminalId);
    });

    console.log(`✅ Created persistent terminal session: ${sessionKey}`);
    return session;
  }

  /**
   * Write command to terminal
   */
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

  /**
   * Resize terminal
   */
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

  /**
   * Terminate a terminal session
   */
  async terminateSession(projectId: string, terminalId: string): Promise<void> {
    const sessionKey = this.getSessionKey(projectId, terminalId);
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return;
    }

    // Kill PTY process
    try {
      session.ptyProcess.kill();
    } catch (error) {
      console.error('Error killing PTY process:', error);
    }

    // Sync workspace to S3
    try {
      await this.syncWorkspaceToS3(projectId, session.workspacePath);
    } catch (error) {
      console.error('Error syncing workspace to S3:', error);
    }

    // Remove session
    this.sessions.delete(sessionKey);
    console.log(`✅ Terminated terminal session: ${sessionKey}`);
  }

  /**
   * Get session
   */
  getSession(projectId: string, terminalId: string): TerminalSession | undefined {
    const sessionKey = this.getSessionKey(projectId, terminalId);
    return this.sessions.get(sessionKey);
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
   * Sync workspace changes back to S3
   */
  private async syncWorkspaceToS3(projectId: string, workspacePath: string): Promise<void> {
    try {
      const { files, folders } = await this.scanDirectory(workspacePath, workspacePath);
      
      console.log(`🔄 Syncing ${files.length} files to S3...`);

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

  private async scanDirectory(
    dirPath: string,
    rootPath: string
  ): Promise<{ files: string[]; folders: string[] }> {
    const files: string[] = [];
    const folders: string[] = [];

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip common build/dependency directories
      if (['node_modules', '.git', '.next', 'dist', 'build', '__pycache__'].includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        const relativePath = path.relative(rootPath, fullPath);
        folders.push(relativePath);

        // Recursively scan subdirectories
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

      // Create CRDT document
      const doc = new Y.Doc();
      const ytext = doc.getText('monaco');
      ytext.insert(0, content);

      // Get state as binary
      const state = Y.encodeStateAsUpdate(doc);

      // Upload to S3
      await this.s3Service.saveCRDTState(projectId, relativePath, state);
    } catch (error) {
      console.error(`Error uploading file ${filePath}:`, error);
    }
  }

  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    for (const [key, session] of this.sessions.entries()) {
      await this.terminateSession(session.projectId, session.terminalId);
    }
  }
}

// Singleton instance
let terminalService: PersistentTerminalService | null = null;

export function getPersistentTerminalService(): PersistentTerminalService {
  if (!terminalService) {
    terminalService = new PersistentTerminalService();
  }
  return terminalService;
}
