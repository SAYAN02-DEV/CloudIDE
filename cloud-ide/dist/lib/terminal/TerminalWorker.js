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
exports.TerminalWorker = void 0;
const SQSTerminalService_1 = require("./SQSTerminalService");
const S3Service_1 = require("../storage/S3Service");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const util_1 = require("util");
const child_process_2 = require("child_process");
const execAsync = (0, util_1.promisify)(child_process_2.exec);
class TerminalWorker {
    constructor() {
        this.sqsService = (0, SQSTerminalService_1.getSQSTerminalService)();
        this.s3Service = (0, S3Service_1.getS3Service)();
        this.workspaceDir = '/tmp/workspaces';
        this.activeSessions = new Map();
        this.workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    async initialize() {
        await this.sqsService.initialize();
        // Create workspace directory
        await fs.mkdir(this.workspaceDir, { recursive: true });
        console.log(`✅ Terminal Worker initialized (ID: ${this.workerId})`);
    }
    async start() {
        console.log('🚀 Starting Terminal Worker...');
        await this.initialize();
        // Start processing commands from SQS
        await this.sqsService.processCommands(async (message) => {
            await this.handleCommand(message);
        });
    }
    getSessionKey(projectId, terminalId) {
        return `${projectId}:${terminalId}`;
    }
    async handleCommand(message) {
        const { projectId, terminalId, type } = message;
        console.log(`📥 Processing ${type} command for project ${projectId}, terminal ${terminalId}`);
        try {
            if (type === 'init') {
                // Initialize a new terminal session
                await this.initializeTerminalSession(projectId, terminalId);
            }
            else if (type === 'execute' && message.command) {
                // Execute command in existing session
                await this.executeCommand(projectId, terminalId, message.command);
            }
            else if (type === 'resize' && message.cols && message.rows) {
                // Resize terminal
                await this.resizeTerminal(projectId, terminalId, message.cols, message.rows);
            }
            else if (type === 'terminate') {
                // Terminate the terminal session
                await this.terminateTerminalSession(projectId, terminalId);
            }
        }
        catch (error) {
            console.error('❌ Error handling command:', error);
            // Send error output back to user
            await this.sqsService.publishOutput(projectId, terminalId, `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        }
    }
    async initializeTerminalSession(projectId, terminalId) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        // Check if session already exists
        if (this.activeSessions.has(sessionKey)) {
            console.log(`✅ Terminal session already active: ${sessionKey}`);
            await this.sqsService.publishOutput(projectId, terminalId, 'Terminal session restored\n');
            return;
        }
        // Download project from S3
        const projectPath = await this.downloadProjectFromS3(projectId);
        // Create new session
        const session = {
            projectId,
            terminalId,
            projectPath,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
        };
        this.activeSessions.set(sessionKey, session);
        // Register session in Redis
        await this.sqsService.registerTerminalSession(projectId, terminalId, this.workerId);
        console.log(`✅ Terminal session initialized: ${sessionKey}`);
        await this.sqsService.publishOutput(projectId, terminalId, 'Terminal session initialized\n');
    }
    async executeCommand(projectId, terminalId, command) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        let session = this.activeSessions.get(sessionKey);
        // If session doesn't exist, initialize it first
        if (!session) {
            console.log(`📥 Session not found, initializing: ${sessionKey}`);
            await this.initializeTerminalSession(projectId, terminalId);
            session = this.activeSessions.get(sessionKey);
        }
        const projectPath = session.projectPath;
        const fullCommand = command.trim();
        try {
            // Use spawn for better output streaming
            const proc = (0, child_process_1.spawn)(fullCommand, {
                shell: true,
                cwd: projectPath,
                env: { ...process.env, FORCE_COLOR: '1' },
            });
            // Store current process reference (overwrites previous)
            session.currentProcess = proc;
            session.lastActivityAt = Date.now();
            // Stream stdout
            proc.stdout?.on('data', async (data) => {
                await this.sqsService.publishOutput(projectId, terminalId, data.toString());
            });
            // Stream stderr
            proc.stderr?.on('data', async (data) => {
                await this.sqsService.publishOutput(projectId, terminalId, data.toString());
            });
            // Handle process exit
            proc.on('close', async (code) => {
                session.currentProcess = undefined;
                session.lastActivityAt = Date.now();
                if (code !== 0) {
                    await this.sqsService.publishOutput(projectId, terminalId, `\nProcess exited with code ${code}\n`);
                }
                // Upload any changed files back to S3
                await this.uploadProjectToS3(projectId, projectPath);
            });
            proc.on('error', async (error) => {
                await this.sqsService.publishOutput(projectId, terminalId, `Error executing command: ${error.message}\n`);
            });
            // Wait for process to complete (but session stays alive)
            await new Promise((resolve) => {
                proc.on('close', () => resolve());
                proc.on('error', () => resolve());
            });
        }
        catch (error) {
            throw error;
        }
    }
    async resizeTerminal(projectId, terminalId, cols, rows) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        const session = this.activeSessions.get(sessionKey);
        if (session && session.currentProcess) {
            if ('resize' in session.currentProcess && typeof session.currentProcess.resize === 'function') {
                session.currentProcess.resize(cols, rows);
            }
        }
    }
    async terminateTerminalSession(projectId, terminalId) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        const session = this.activeSessions.get(sessionKey);
        if (!session) {
            console.log(`⚠️  Session not found: ${sessionKey}`);
            return;
        }
        // Kill any active process
        if (session.currentProcess) {
            session.currentProcess.kill('SIGTERM');
        }
        // Upload final state to S3
        await this.uploadProjectToS3(projectId, session.projectPath);
        // Remove session
        this.activeSessions.delete(sessionKey);
        // Unregister from Redis
        await this.sqsService.unregisterTerminalSession(projectId, terminalId);
        console.log(`✅ Terminal session terminated: ${sessionKey}`);
        await this.sqsService.publishOutput(projectId, terminalId, 'Terminal session terminated\n');
    }
    async downloadProjectFromS3(projectId) {
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
    async uploadProjectToS3(projectId, projectPath) {
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
    async getAllFiles(dirPath) {
        const files = [];
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                // Skip node_modules and other common directories
                if (!['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
                    files.push(...(await this.getAllFiles(fullPath)));
                }
            }
            else {
                files.push(fullPath);
            }
        }
        return files;
    }
    async stop() {
        // Kill all active processes and terminate sessions
        for (const [key, session] of this.activeSessions.entries()) {
            if (session.currentProcess) {
                session.currentProcess.kill();
            }
            // Upload final state
            await this.uploadProjectToS3(session.projectId, session.projectPath);
        }
        console.log('✅ Terminal Worker stopped');
    }
}
exports.TerminalWorker = TerminalWorker;
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
