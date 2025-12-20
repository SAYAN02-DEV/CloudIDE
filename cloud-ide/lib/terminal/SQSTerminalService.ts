import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { createClient, RedisClientType } from 'redis';

export interface TerminalCommand {
  projectId: string;
  terminalId: string;
  userId: string;
  command: string;
  timestamp: number;
}

export interface TerminalCommandMessage {
  type: 'execute' | 'resize' | 'init' | 'terminate';
  projectId: string;
  terminalId: string;
  userId: string;
  command?: string;
  cols?: number;
  rows?: number;
}

export class SQSTerminalService {
  private sqsClient: SQSClient;
  private queueUrl: string;
  private redisPub: RedisClientType;
  private redisClient: RedisClientType;

  constructor() {
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });

    this.queueUrl = process.env.AWS_SQS_QUEUE_URL || '';

    this.redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    this.redisPub = this.redisClient.duplicate();
  }

  async initialize(): Promise<void> {
    await this.redisClient.connect();
    await this.redisPub.connect();
    console.log('✅ SQS Terminal Service initialized');
  }

  /**
   * Queue a terminal command for execution
   */
  async queueCommand(command: TerminalCommandMessage): Promise<void> {
    const messageBody = JSON.stringify(command);

    const sendCommand = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: messageBody,
      MessageAttributes: {
        projectId: {
          DataType: 'String',
          StringValue: command.projectId,
        },
        terminalId: {
          DataType: 'String',
          StringValue: command.terminalId,
        },
        type: {
          DataType: 'String',
          StringValue: command.type,
        },
      },
    });

    try {
      await this.sqsClient.send(sendCommand);
      console.log(`✅ Queued terminal command for project ${command.projectId}`);
    } catch (error) {
      console.error('❌ Error queuing terminal command:', error);
      throw error;
    }
  }

  /**
   * Process terminal commands from the queue (called by worker pods)
   */
  async processCommands(
    handler: (message: TerminalCommandMessage) => Promise<void>
  ): Promise<void> {
    while (true) {
      try {
        const receiveCommand = new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20, // Long polling
          MessageAttributeNames: ['All'],
        });

        const response = await this.sqsClient.send(receiveCommand);

        if (response.Messages && response.Messages.length > 0) {
          for (const message of response.Messages) {
            try {
              const commandMessage: TerminalCommandMessage = JSON.parse(
                message.Body || '{}'
              );

              // Process the command
              await handler(commandMessage);

              // Delete message from queue after successful processing
              const deleteCommand = new DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
              });

              await this.sqsClient.send(deleteCommand);
            } catch (error) {
              console.error('❌ Error processing terminal command:', error);
              // Message will be returned to queue after visibility timeout
            }
          }
        }
      } catch (error) {
        console.error('❌ Error receiving messages from SQS:', error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Publish terminal output back to Redis for broadcasting
   */
  async publishOutput(
    projectId: string,
    terminalId: string,
    output: string
  ): Promise<void> {
    const message = {
      type: 'output',
      projectId,
      terminalId,
      data: { output },
    };

    await this.redisPub.publish('terminal:output', JSON.stringify(message));
  }

  /**
   * Store terminal session state in Redis
   */
  async saveTerminalState(
    projectId: string,
    terminalId: string,
    state: any
  ): Promise<void> {
    const key = `terminal:state:${projectId}:${terminalId}`;
    await this.redisClient.set(key, JSON.stringify(state), {
      EX: 3600, // Expire after 1 hour
    });
  }

  /**
   * Get terminal session state from Redis
   */
  async getTerminalState(projectId: string, terminalId: string): Promise<any | null> {
    const key = `terminal:state:${projectId}:${terminalId}`;
    const state = await this.redisClient.get(key);
    return state ? JSON.parse(state) : null;
  }

  /**
   * Store a terminal session as active
   */
  async registerTerminalSession(
    projectId: string,
    terminalId: string,
    workerId: string
  ): Promise<void> {
    const key = `terminal:session:${projectId}:${terminalId}`;
    await this.redisClient.set(key, JSON.stringify({ workerId, createdAt: Date.now() }), {
      EX: 3600, // Expire after 1 hour of inactivity
    });
  }

  /**
   * Remove a terminal session
   */
  async unregisterTerminalSession(
    projectId: string,
    terminalId: string
  ): Promise<void> {
    const key = `terminal:session:${projectId}:${terminalId}`;
    await this.redisClient.del(key);
  }

  /**
   * Check if a terminal session is active
   */
  async isTerminalSessionActive(
    projectId: string,
    terminalId: string
  ): Promise<boolean> {
    const key = `terminal:session:${projectId}:${terminalId}`;
    const session = await this.redisClient.get(key);
    return !!session;
  }

  async close(): Promise<void> {
    await this.redisClient.quit();
    await this.redisPub.quit();
  }
}

// Singleton
let sqsTerminalService: SQSTerminalService | null = null;

export const getSQSTerminalService = (): SQSTerminalService => {
  if (!sqsTerminalService) {
    sqsTerminalService = new SQSTerminalService();
  }
  return sqsTerminalService;
};
