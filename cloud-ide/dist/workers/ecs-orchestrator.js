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
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const ECSTaskService_1 = require("../lib/ecs/ECSTaskService");
const SQSService_1 = require("../lib/queue/SQSService");
/**
 * ECS Task Orchestrator
 * Monitors SQS queue and auto-scales ECS Fargate tasks
 */
class ECSOrchestrator {
    constructor() {
        this.isRunning = false;
        this.checkInterval = 30000; // Check every 30 seconds
        this.ecsService = (0, ECSTaskService_1.getECSTaskService)();
        this.sqsService = (0, SQSService_1.getSQSService)();
    }
    async start() {
        this.isRunning = true;
        console.log('🚀 ECS Task Orchestrator started');
        console.log(`📊 Auto-scaling configuration:`);
        console.log(`   - Min tasks: ${process.env.ECS_MIN_TASKS || 1}`);
        console.log(`   - Max tasks: ${process.env.ECS_MAX_TASKS || 10}`);
        console.log(`   - Messages per task: ${process.env.ECS_MESSAGES_PER_TASK || 5}`);
        console.log(`   - Check interval: ${this.checkInterval / 1000}s`);
        await this.sqsService.initialize();
        // Start monitoring loop
        this.monitorAndScale();
    }
    async monitorAndScale() {
        while (this.isRunning) {
            try {
                // Get queue depth
                const queueDepth = await this.getQueueDepth();
                // Auto-scale based on queue depth
                await this.ecsService.autoScaleWorkers(queueDepth, parseInt(process.env.ECS_MIN_TASKS || '1'), parseInt(process.env.ECS_MAX_TASKS || '10'), parseInt(process.env.ECS_MESSAGES_PER_TASK || '5'));
                // Wait before next check
                await this.sleep(this.checkInterval);
            }
            catch (error) {
                console.error('❌ Error in monitoring loop:', error);
                await this.sleep(this.checkInterval);
            }
        }
    }
    async getQueueDepth() {
        // Use SQS GetQueueAttributes to get approximate number of messages
        const { SQSClient, GetQueueAttributesCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-sqs')));
        const sqsClient = new SQSClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            },
        });
        const command = new GetQueueAttributesCommand({
            QueueUrl: process.env.AWS_SQS_QUEUE_URL || '',
            AttributeNames: ['ApproximateNumberOfMessages'],
        });
        try {
            const response = await sqsClient.send(command);
            const queueDepth = parseInt(response.Attributes?.ApproximateNumberOfMessages || '0');
            return queueDepth;
        }
        catch (error) {
            console.error('❌ Error getting queue depth:', error);
            return 0;
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    stop() {
        this.isRunning = false;
        console.log('🛑 ECS Task Orchestrator stopped');
    }
}
// Entry point
if (require.main === module) {
    const orchestrator = new ECSOrchestrator();
    orchestrator.start().catch((error) => {
        console.error('❌ Fatal error in ECS Orchestrator:', error);
        process.exit(1);
    });
    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('Received SIGTERM, shutting down gracefully...');
        orchestrator.stop();
        process.exit(0);
    });
    process.on('SIGINT', () => {
        console.log('Received SIGINT, shutting down gracefully...');
        orchestrator.stop();
        process.exit(0);
    });
}
exports.default = ECSOrchestrator;
