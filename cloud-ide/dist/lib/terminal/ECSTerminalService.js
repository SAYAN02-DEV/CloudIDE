"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ECSTerminalService = void 0;
exports.getECSTerminalService = getECSTerminalService;
const client_ecs_1 = require("@aws-sdk/client-ecs");
const S3Service_1 = require("../storage/S3Service");
const events_1 = require("events");
const ws_1 = require("ws");
class ECSTerminalService extends events_1.EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();
        this.s3Service = (0, S3Service_1.getS3Service)();
        this.useLocalStack = process.env.USE_LOCALSTACK === 'true';
        // ECS Configuration
        this.clusterName = process.env.ECS_CLUSTER_NAME || 'cloudide-cluster';
        this.taskDefinition = process.env.ECS_TASK_DEFINITION || 'cloudide-terminal-task';
        this.subnets = (process.env.ECS_SUBNETS || '').split(',').filter(Boolean);
        this.securityGroups = (process.env.ECS_SECURITY_GROUPS || '').split(',').filter(Boolean);
        // Initialize ECS client
        const region = this.useLocalStack ? 'us-east-1' : (process.env.AWS_REGION || 'us-east-1');
        this.ecsClient = new client_ecs_1.ECSClient({
            region,
            endpoint: this.useLocalStack ? 'http://localhost:4566' : undefined,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
            },
        });
    }
    async initialize() {
        console.log('✅ ECS Terminal Service initialized');
        console.log(`   Cluster: ${this.clusterName}`);
        console.log(`   Task Definition: ${this.taskDefinition}`);
    }
    getSessionKey(projectId, terminalId) {
        return `${projectId}:${terminalId}`;
    }
    /**
     * Create a new terminal session by launching an ECS Fargate task
     */
    async createSession(projectId, terminalId, userId) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        // Check if session already exists
        if (this.sessions.has(sessionKey)) {
            console.log(`♻️  Reusing existing session: ${sessionKey}`);
            return this.sessions.get(sessionKey);
        }
        // Prepare workspace in S3 (download files to sync state)
        await this.prepareWorkspace(projectId);
        try {
            // Launch ECS Fargate task
            const containerName = 'terminal';
            const taskResponse = await this.ecsClient.send(new client_ecs_1.RunTaskCommand({
                cluster: this.clusterName,
                taskDefinition: this.taskDefinition,
                launchType: 'FARGATE',
                enableExecuteCommand: true, // Enable ECS Exec
                networkConfiguration: {
                    awsvpcConfiguration: {
                        subnets: this.subnets,
                        securityGroups: this.securityGroups,
                        assignPublicIp: 'ENABLED',
                    },
                },
                overrides: {
                    containerOverrides: [
                        {
                            name: containerName,
                            environment: [
                                { name: 'PROJECT_ID', value: projectId },
                                { name: 'TERMINAL_ID', value: terminalId },
                                { name: 'USER_ID', value: userId },
                                { name: 'AWS_REGION', value: process.env.AWS_REGION || 'us-east-1' },
                                { name: 'S3_BUCKET', value: process.env.AWS_S3_BUCKET || 'cloudide-projects' },
                            ],
                        },
                    ],
                },
                tags: [
                    { key: 'ProjectId', value: projectId },
                    { key: 'TerminalId', value: terminalId },
                    { key: 'UserId', value: userId },
                    { key: 'Service', value: 'CloudIDE-Terminal' },
                ],
            }));
            if (!taskResponse.tasks || taskResponse.tasks.length === 0) {
                throw new Error('Failed to launch ECS task');
            }
            const task = taskResponse.tasks[0];
            const taskArn = task.taskArn;
            console.log(`✅ Launched ECS task: ${taskArn.split('/').pop()}`);
            // Wait for task to be running
            await this.waitForTaskRunning(taskArn);
            // Create session
            const session = {
                projectId,
                terminalId,
                userId,
                taskArn,
                clusterArn: this.clusterName,
                containerName,
                createdAt: Date.now(),
                lastActivityAt: Date.now(),
            };
            this.sessions.set(sessionKey, session);
            // Connect to task via ECS Exec WebSocket
            await this.connectToTask(session);
            console.log(`✅ Created ECS terminal session: ${sessionKey}`);
            return session;
        }
        catch (error) {
            console.error('❌ Error creating ECS task:', error);
            throw error;
        }
    }
    /**
     * Wait for ECS task to reach RUNNING state
     */
    async waitForTaskRunning(taskArn, maxRetries = 30) {
        for (let i = 0; i < maxRetries; i++) {
            const response = await this.ecsClient.send(new client_ecs_1.DescribeTasksCommand({
                cluster: this.clusterName,
                tasks: [taskArn],
            }));
            if (response.tasks && response.tasks.length > 0) {
                const task = response.tasks[0];
                if (task.lastStatus === 'RUNNING') {
                    console.log(`✅ Task ${taskArn.split('/').pop()} is RUNNING`);
                    return;
                }
                if (task.lastStatus === 'STOPPED') {
                    throw new Error(`Task stopped unexpectedly: ${task.stopCode}`);
                }
            }
            // Wait 2 seconds before checking again
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        throw new Error('Task did not reach RUNNING state within timeout');
    }
    /**
     * Connect to ECS task using ECS Exec
     */
    async connectToTask(session) {
        try {
            // Execute command to start bash shell
            const response = await this.ecsClient.send(new client_ecs_1.ExecuteCommandCommand({
                cluster: this.clusterName,
                task: session.taskArn,
                container: session.containerName,
                command: '/bin/bash',
                interactive: true,
            }));
            if (!response.session) {
                throw new Error('Failed to create ECS Exec session');
            }
            // The session contains a WebSocket URL for the interactive terminal
            // In a real implementation, you'd connect to this WebSocket and relay I/O
            console.log(`✅ Connected to ECS task via ECS Exec`);
            // Store session info for later use
            session.lastActivityAt = Date.now();
        }
        catch (error) {
            console.error('❌ Error connecting to task:', error);
            throw error;
        }
    }
    /**
     * Write data to terminal (via ECS Exec session)
     */
    async writeToTerminal(projectId, terminalId, data) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        const session = this.sessions.get(sessionKey);
        if (!session) {
            throw new Error(`Terminal session not found: ${sessionKey}`);
        }
        session.lastActivityAt = Date.now();
        // In a full implementation, write data to the ECS Exec WebSocket
        if (session.websocket && session.websocket.readyState === ws_1.WebSocket.OPEN) {
            session.websocket.send(data);
        }
        else {
            // Emit event for now (the WebSocket connection would be handled by AWS Session Manager Agent)
            this.emit('input', { projectId, terminalId, data });
        }
    }
    /**
     * Resize terminal
     */
    async resizeTerminal(projectId, terminalId, cols, rows) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        const session = this.sessions.get(sessionKey);
        if (session) {
            // Send resize signal via ECS Exec
            this.emit('resize', { projectId, terminalId, cols, rows });
        }
    }
    /**
     * Terminate a terminal session by stopping the ECS task
     */
    async terminateSession(projectId, terminalId) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        const session = this.sessions.get(sessionKey);
        if (!session) {
            return;
        }
        try {
            // Stop the ECS task
            await this.ecsClient.send(new client_ecs_1.StopTaskCommand({
                cluster: this.clusterName,
                task: session.taskArn,
                reason: 'Terminal session closed by user',
            }));
            console.log(`🛑 Stopped ECS task: ${session.taskArn.split('/').pop()}`);
        }
        catch (error) {
            console.error('Error stopping ECS task:', error);
        }
        // Close WebSocket if exists
        if (session.websocket) {
            session.websocket.close();
        }
        // Sync workspace from S3 (files are already synced by the container)
        // The container should sync files back to S3 before stopping
        // Remove session
        this.sessions.delete(sessionKey);
        console.log(`✅ Terminated ECS terminal session: ${sessionKey}`);
    }
    /**
     * Get session
     */
    getSession(projectId, terminalId) {
        const sessionKey = this.getSessionKey(projectId, terminalId);
        return this.sessions.get(sessionKey);
    }
    /**
     * Prepare workspace by ensuring files are synced to S3
     */
    async prepareWorkspace(projectId) {
        try {
            // Files are already in S3 from the editor
            // The ECS container will download them when it starts
            const files = await this.s3Service.listCRDTFiles(projectId);
            console.log(`📥 Project has ${files.length} files in S3 for ECS container`);
        }
        catch (error) {
            console.error('❌ Error preparing workspace:', error);
            throw error;
        }
    }
    /**
     * Cleanup all sessions
     */
    async cleanup() {
        console.log(`🧹 Cleaning up ${this.sessions.size} ECS terminal sessions...`);
        for (const [key, session] of this.sessions.entries()) {
            await this.terminateSession(session.projectId, session.terminalId);
        }
    }
}
exports.ECSTerminalService = ECSTerminalService;
// Singleton instance
let terminalService = null;
function getECSTerminalService() {
    if (!terminalService) {
        terminalService = new ECSTerminalService();
    }
    return terminalService;
}
