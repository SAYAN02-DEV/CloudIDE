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
exports.DockerTerminalService = void 0;
exports.getDockerTerminalService = getDockerTerminalService;
const pty = __importStar(require("node-pty"));
const S3Service_1 = require("../storage/S3Service");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const Y = __importStar(require("yjs"));
const events_1 = require("events");
const child_process_1 = require("child_process");
class DockerTerminalService extends events_1.EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();
        this.workspaceRoot = '/tmp/cloudide-workspaces';
        this.s3Service = (0, S3Service_1.getS3Service)();
    }
    async initialize() {
        await fs.mkdir(this.workspaceRoot, { recursive: true });
        // Check if Docker is available
        try {
            await this.execCommand('docker --version');
            console.log('✅ Docker Terminal Service initialized');
        }
        catch (error) {
            throw new Error('Docker is not available. Please install Docker to use terminal features.');
        }
    }
    getSessionKey(projectId, terminalId) {
        return `${projectId}:${terminalId}`;
    }
    /**
     * Create a new terminal session in an isolated Docker container
     */
    async createSession(projectId, terminalId, userId) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        // Check if session already exists
        if (this.sessions.has(sessionKey)) {
            console.log(`♻️  Reusing existing session: ${sessionKey}`);
            return this.sessions.get(sessionKey);
        }
        // Prepare workspace on host
        const workspacePath = await this.prepareWorkspace(projectId);
        // Create Docker container for this session
        const containerName = `cloudide-${projectId}-${terminalId}`.replace(/[^a-zA-Z0-9_-]/g, '-');
        try {
            // Run Docker container with workspace mounted
            // Using alpine or ubuntu image with limited permissions
            const dockerCommand = [
                'docker', 'run',
                '-dit', // detached, interactive, tty
                '--name', containerName,
                '--rm', // Remove container when it stops
                '--network', 'none', // No network access by default
                '-v', `${workspacePath}:/workspace`, // Mount workspace
                '-w', '/workspace', // Set working directory
                '--memory', '512m', // Memory limit
                '--cpus', '1', // CPU limit
                '--user', '1000:1000', // Run as non-root user
                'ubuntu:22.04', // Base image
                'bash'
            ].join(' ');
            const result = await this.execCommand(dockerCommand);
            const containerId = result.trim();
            console.log(`✅ Created Docker container: ${containerName} (${containerId.substring(0, 12)})`);
            // Create PTY that executes commands in the container
            const ptyProcess = pty.spawn('docker', ['exec', '-it', containerId, 'bash'], {
                name: 'xterm-color',
                cols: 80,
                rows: 30,
                cwd: process.cwd(),
                env: process.env,
            });
            // Create session
            const session = {
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
            console.log(`✅ Created isolated terminal session in container: ${sessionKey}`);
            return session;
        }
        catch (error) {
            console.error('❌ Error creating Docker container:', error);
            throw error;
        }
    }
    /**
     * Write command to terminal
     */
    async writeToTerminal(projectId, terminalId, data) {
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
    async resizeTerminal(projectId, terminalId, cols, rows) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        const session = this.sessions.get(sessionKey);
        if (session) {
            session.ptyProcess.resize(cols, rows);
        }
    }
    /**
     * Terminate a terminal session and stop the container
     */
    async terminateSession(projectId, terminalId) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        const session = this.sessions.get(sessionKey);
        if (!session) {
            return;
        }
        // Kill PTY process
        try {
            session.ptyProcess.kill();
        }
        catch (error) {
            console.error('Error killing PTY process:', error);
        }
        // Stop and remove Docker container
        try {
            await this.execCommand(`docker stop ${session.containerId}`);
            console.log(`🛑 Stopped Docker container: ${session.containerName}`);
        }
        catch (error) {
            console.error('Error stopping container:', error);
        }
        // Sync workspace to S3
        try {
            await this.syncWorkspaceToS3(projectId, session.workspacePath);
        }
        catch (error) {
            console.error('Error syncing workspace to S3:', error);
        }
        // Remove session
        this.sessions.delete(sessionKey);
        console.log(`✅ Terminated terminal session: ${sessionKey}`);
    }
    /**
     * Get session
     */
    getSession(projectId, terminalId) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        return this.sessions.get(sessionKey);
    }
    /**
     * Execute a shell command and return output
     */
    execCommand(command) {
        return new Promise((resolve, reject) => {
            const proc = (0, child_process_1.spawn)(command, {
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
                }
                else {
                    reject(new Error(`Command failed: ${stderr || stdout}`));
                }
            });
            proc.on('error', (error) => {
                reject(error);
            });
        });
    }
    /**
     * Prepare workspace by downloading files from S3
     */
    async prepareWorkspace(projectId) {
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
        }
        catch (error) {
            console.error('❌ Error preparing workspace:', error);
            throw error;
        }
    }
    /**
     * Download CRDT state from S3 and convert to actual file
     */
    async downloadAndConvertFile(projectId, filePath, workspacePath) {
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
            console.log(`✅ Converted file: ${filePath} (${content.length} bytes)`);
        }
        catch (error) {
            console.error(`❌ Error converting file ${filePath}:`, error);
        }
    }
    /**
     * Sync workspace changes back to S3
     */
    async syncWorkspaceToS3(projectId, workspacePath) {
        try {
            const { files, folders } = await this.scanDirectory(workspacePath, workspacePath);
            console.log(`🔄 Syncing ${files.length} files to S3...`);
            for (const folderPath of folders) {
                await this.s3Service.createCRDTFolder(projectId, folderPath);
            }
            for (const filePath of files) {
                await this.uploadFileToCRDT(projectId, filePath, workspacePath);
            }
            console.log(`✅ Workspace synced to S3`);
        }
        catch (error) {
            console.error('❌ Error syncing workspace to S3:', error);
        }
    }
    async scanDirectory(dirPath, rootPath) {
        const files = [];
        const folders = [];
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
            }
            else {
                files.push(fullPath);
            }
        }
        return { files, folders };
    }
    async uploadFileToCRDT(projectId, filePath, workspacePath) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const relativePath = path.relative(workspacePath, filePath);
            const doc = new Y.Doc();
            const ytext = doc.getText('monaco');
            ytext.insert(0, content);
            const state = Y.encodeStateAsUpdate(doc);
            await this.s3Service.saveCRDTState(projectId, relativePath, state);
        }
        catch (error) {
            console.error(`Error uploading file ${filePath}:`, error);
        }
    }
    /**
     * Cleanup all sessions
     */
    async cleanup() {
        for (const [key, session] of this.sessions.entries()) {
            await this.terminateSession(session.projectId, session.terminalId);
        }
    }
}
exports.DockerTerminalService = DockerTerminalService;
// Singleton instance
let terminalService = null;
function getDockerTerminalService() {
    if (!terminalService) {
        terminalService = new DockerTerminalService();
    }
    return terminalService;
}
