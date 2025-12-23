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
exports.SQSService = void 0;
exports.getSQSService = getSQSService;
const client_sqs_1 = require("@aws-sdk/client-sqs");
class SQSService {
    constructor() {
        this.initialized = false;
        this.useLocalStack = process.env.USE_LOCALSTACK === 'true' ||
            !process.env.AWS_ACCESS_KEY_ID;
        // For LocalStack, always use us-east-1. For AWS, use configured region
        const region = this.useLocalStack ? 'us-east-1' : (process.env.AWS_REGION || 'us-east-1');
        this.sqsClient = new client_sqs_1.SQSClient({
            region,
            endpoint: this.useLocalStack ? 'http://localhost:4566' : undefined,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
            },
        });
        this.queueUrl = process.env.AWS_SQS_QUEUE_URL || 'http://localhost:4566/000000000000/cloudide-terminal-queue';
        if (this.useLocalStack) {
            console.log('🔧 Using LocalStack for SQS (local development)');
        }
    }
    /**
     * Initialize SQS service (must be called before use)
     */
    async initialize() {
        if (this.initialized)
            return;
        if (this.useLocalStack) {
            await this.ensureQueueExists();
        }
        this.initialized = true;
        console.log(`✅ SQS Service initialized with queue URL: ${this.queueUrl}`);
    }
    /**
     * Ensure SQS queue exists in LocalStack
     */
    async ensureQueueExists() {
        try {
            const { CreateQueueCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-sqs')));
            try {
                // Try to get queue URL
                const getUrlResult = await this.sqsClient.send(new client_sqs_1.GetQueueUrlCommand({
                    QueueName: 'cloudide-terminal-queue'
                }));
                if (getUrlResult.QueueUrl) {
                    this.queueUrl = getUrlResult.QueueUrl;
                    console.log(`✅ SQS queue already exists: ${this.queueUrl}`);
                }
            }
            catch {
                // Queue doesn't exist, create it
                const result = await this.sqsClient.send(new CreateQueueCommand({
                    QueueName: 'cloudide-terminal-queue',
                    Attributes: {
                        VisibilityTimeout: '300', // 5 minutes
                        MessageRetentionPeriod: '1209600', // 14 days
                    }
                }));
                if (result.QueueUrl) {
                    this.queueUrl = result.QueueUrl;
                }
                console.log(`✅ Created SQS queue: ${this.queueUrl}`);
            }
        }
        catch (error) {
            console.error('⚠️  Error ensuring SQS queue exists:', error);
        }
    }
    /**
     * Send terminal command to SQS queue
     */
    async sendCommand(command) {
        try {
            console.log(`📤 Sending to queue: ${this.queueUrl}`);
            const message = new client_sqs_1.SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: JSON.stringify(command),
                MessageAttributes: {
                    projectId: {
                        DataType: 'String',
                        StringValue: command.projectId,
                    },
                    terminalId: {
                        DataType: 'String',
                        StringValue: command.terminalId,
                    },
                    userId: {
                        DataType: 'String',
                        StringValue: command.userId,
                    },
                },
            });
            const result = await this.sqsClient.send(message);
            console.log(`✅ Sent command to SQS: ${command.command} (MessageId: ${result.MessageId})`);
        }
        catch (error) {
            console.error('❌ Error sending command to SQS:', error);
            throw error;
        }
    }
    /**
     * Receive messages from SQS queue (for worker pods)
     */
    async receiveCommands(maxMessages = 1) {
        try {
            const result = await this.sqsClient.send(new client_sqs_1.ReceiveMessageCommand({
                QueueUrl: this.queueUrl,
                MaxNumberOfMessages: maxMessages,
                WaitTimeSeconds: 20, // Long polling
                MessageAttributeNames: ['All'],
            }));
            if (!result.Messages || result.Messages.length === 0) {
                return [];
            }
            console.log(`📥 Received ${result.Messages.length} message(s) from queue`);
            return result.Messages.map(msg => ({
                command: JSON.parse(msg.Body || '{}'),
                receiptHandle: msg.ReceiptHandle,
            }));
        }
        catch (error) {
            console.error('❌ Error receiving commands from SQS:', error);
            return [];
        }
    }
    /**
     * Delete message from queue after processing
     */
    async deleteCommand(receiptHandle) {
        try {
            await this.sqsClient.send(new client_sqs_1.DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: receiptHandle,
            }));
            console.log('✅ Deleted message from SQS queue');
        }
        catch (error) {
            console.error('❌ Error deleting message from SQS:', error);
        }
    }
}
exports.SQSService = SQSService;
let sqsService = null;
function getSQSService() {
    if (!sqsService) {
        sqsService = new SQSService();
    }
    return sqsService;
}
