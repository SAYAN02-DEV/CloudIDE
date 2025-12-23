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
exports.PersistentTerminalService = void 0;
exports.getPersistentTerminalService = getPersistentTerminalService;
const pty = __importStar(require("node-pty"));
const S3Service_1 = require("../storage/S3Service");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const Y = __importStar(require("yjs"));
const events_1 = require("events");
class PersistentTerminalService extends events_1.EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();
        this.workspaceRoot = '/tmp/cloudide-workspaces';
        this.s3Service = (0, S3Service_1.getS3Service)();
    }
    async initialize() {
        await fs.mkdir(this.workspaceRoot, { recursive: true });
        console.log('✅ Persistent Terminal Service initialized');
    }
    getSessionKey(projectId, terminalId) {
        return `${projectId}:${terminalId}`;
    }
    /**
     * Create a new terminal session with persistent PTY
     */
    async createSession(projectId, terminalId, userId) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        // Check if session already exists
        if (this.sessions.has(sessionKey)) {
            console.log(`♻️  Reusing existing session: ${sessionKey}`);
            return this.sessions.get(sessionKey);
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
        const session = {
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
     * Terminate a terminal session
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
            // Upload folders as markers
            for (const folderPath of folders) {
                await this.s3Service.createCRDTFolder(projectId, folderPath);
            }
            // Upload each file as CRDT state
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
            // Create CRDT document
            const doc = new Y.Doc();
            const ytext = doc.getText('monaco');
            ytext.insert(0, content);
            // Get state as binary
            const state = Y.encodeStateAsUpdate(doc);
            // Upload to S3
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
exports.PersistentTerminalService = PersistentTerminalService;
// Singleton instance
let terminalService = null;
function getPersistentTerminalService() {
    if (!terminalService) {
        terminalService = new PersistentTerminalService();
    }
    return terminalService;
}
