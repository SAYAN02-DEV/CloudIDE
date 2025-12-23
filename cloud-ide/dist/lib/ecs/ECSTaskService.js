"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ECSTaskService = void 0;
exports.getECSTaskService = getECSTaskService;
const client_ecs_1 = require("@aws-sdk/client-ecs");
class ECSTaskService {
    constructor(config) {
        this.ecsClient = new client_ecs_1.ECSClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            },
        });
        this.config = config;
    }
    /**
     * Launch a new Fargate task to process terminal commands
     */
    async launchWorkerTask(taskCount = 1, environmentOverrides) {
        const containerOverrides = [];
        if (environmentOverrides) {
            containerOverrides.push({
                name: 'cloudide-worker', // Must match container name in task definition
                environment: Object.entries(environmentOverrides).map(([name, value]) => ({
                    name,
                    value,
                })),
            });
        }
        const command = new client_ecs_1.RunTaskCommand({
            cluster: this.config.cluster,
            taskDefinition: this.config.taskDefinition,
            launchType: 'FARGATE',
            count: taskCount,
            networkConfiguration: {
                awsvpcConfiguration: {
                    subnets: this.config.subnets,
                    securityGroups: this.config.securityGroups,
                    assignPublicIp: this.config.assignPublicIp ? 'ENABLED' : 'DISABLED',
                },
            },
            overrides: containerOverrides.length > 0 ? { containerOverrides } : undefined,
        });
        try {
            const response = await this.ecsClient.send(command);
            const taskArns = response.tasks?.map((task) => task.taskArn || '') || [];
            console.log(`✅ Launched ${taskArns.length} ECS Fargate task(s)`);
            return taskArns;
        }
        catch (error) {
            console.error('❌ Error launching ECS task:', error);
            throw error;
        }
    }
    /**
     * Get the number of running worker tasks
     */
    async getRunningTaskCount() {
        const command = new client_ecs_1.ListTasksCommand({
            cluster: this.config.cluster,
            family: this.config.taskDefinition.split(':')[0], // Get task family without version
            desiredStatus: 'RUNNING',
        });
        try {
            const response = await this.ecsClient.send(command);
            return response.taskArns?.length || 0;
        }
        catch (error) {
            console.error('❌ Error getting running task count:', error);
            return 0;
        }
    }
    /**
     * Get detailed information about tasks
     */
    async describeTasks(taskArns) {
        if (taskArns.length === 0)
            return [];
        const command = new client_ecs_1.DescribeTasksCommand({
            cluster: this.config.cluster,
            tasks: taskArns,
        });
        try {
            const response = await this.ecsClient.send(command);
            return response.tasks || [];
        }
        catch (error) {
            console.error('❌ Error describing tasks:', error);
            return [];
        }
    }
    /**
     * Stop a running task
     */
    async stopTask(taskArn, reason) {
        const command = new client_ecs_1.StopTaskCommand({
            cluster: this.config.cluster,
            task: taskArn,
            reason: reason || 'Manual stop',
        });
        try {
            await this.ecsClient.send(command);
            console.log(`✅ Stopped ECS task: ${taskArn}`);
        }
        catch (error) {
            console.error('❌ Error stopping task:', error);
            throw error;
        }
    }
    /**
     * Auto-scale worker tasks based on SQS queue depth
     */
    async autoScaleWorkers(queueDepth, minTasks = 1, maxTasks = 10, messagesPerTask = 5) {
        const currentRunning = await this.getRunningTaskCount();
        const desiredTasks = Math.min(Math.max(Math.ceil(queueDepth / messagesPerTask), minTasks), maxTasks);
        console.log(`📊 Queue depth: ${queueDepth}, Current tasks: ${currentRunning}, Desired: ${desiredTasks}`);
        if (desiredTasks > currentRunning) {
            const tasksToLaunch = desiredTasks - currentRunning;
            console.log(`🚀 Scaling up: Launching ${tasksToLaunch} new task(s)`);
            await this.launchWorkerTask(tasksToLaunch);
        }
        // Note: Tasks will automatically stop when queue is empty (no work to do)
    }
}
exports.ECSTaskService = ECSTaskService;
let ecsTaskService = null;
function getECSTaskService() {
    if (!ecsTaskService) {
        ecsTaskService = new ECSTaskService({
            cluster: process.env.ECS_CLUSTER_NAME || 'cloudide-cluster',
            taskDefinition: process.env.ECS_TASK_DEFINITION || 'cloudide-worker',
            subnets: process.env.ECS_SUBNETS?.split(',') || [],
            securityGroups: process.env.ECS_SECURITY_GROUPS?.split(',') || [],
            assignPublicIp: process.env.ECS_ASSIGN_PUBLIC_IP === 'true',
        });
    }
    return ecsTaskService;
}
