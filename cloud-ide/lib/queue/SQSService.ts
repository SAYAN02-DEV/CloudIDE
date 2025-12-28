import { 
  SQSClient, 
  SendMessageCommand, 
  ReceiveMessageCommand, 
  DeleteMessageCommand,
  GetQueueUrlCommand 
} from '@aws-sdk/client-sqs';

export interface TerminalCommand {
  projectId: string;
  terminalId: string;
  userId: string;
  username: string;
  command: string;
  timestamp: number;
}

export class SQSService {
  private sqsClient: SQSClient;
  private queueUrl: string;
  private useLocalStack: boolean;
  private initialized: boolean = false;

  constructor() {
    this.useLocalStack = process.env.USE_LOCALSTACK === 'true' || 
                          !process.env.AWS_ACCESS_KEY_ID;
    
    // For LocalStack, always use us-east-1. For AWS, use configured region
    const region = this.useLocalStack ? 'us-east-1' : (process.env.AWS_REGION || 'us-east-1');
    
    this.sqsClient = new SQSClient({
      region,
      endpoint: this.useLocalStack ? 'http://localhost:4566' : undefined,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    });

    this.queueUrl = process.env.AWS_SQS_QUEUE_URL || 'http://localhost:4566/000000000000/cloudide-terminal-queue';
    
    if (this.useLocalStack) {
      console.log('Using LocalStack for SQS (local development)');
    }
  }

  /**
   * Initialize SQS service (must be called before use)
   */
  async initialize() {
    if (this.initialized) return;
    
    if (this.useLocalStack) {
      await this.ensureQueueExists();
    }
    
    this.initialized = true;
    console.log(`SQS Service initialized with queue URL: ${this.queueUrl}`);
  }

  /**
   * Ensure SQS queue exists in LocalStack
   */
  private async ensureQueueExists() {
    try {
      const { CreateQueueCommand } = await import('@aws-sdk/client-sqs');
      
      try {
        // Try to get queue URL
        const getUrlResult = await this.sqsClient.send(new GetQueueUrlCommand({
          QueueName: 'cloudide-terminal-queue'
        }));
        
        if (getUrlResult.QueueUrl) {
          this.queueUrl = getUrlResult.QueueUrl;
          console.log(`SQS queue already exists: ${this.queueUrl}`);
        }
      } catch {
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
        
        console.log(`Created SQS queue: ${this.queueUrl}`);
      }
    } catch (error) {
      console.error('Error ensuring SQS queue exists:', error);
    }
  }

  /**
   * Send terminal command to SQS queue
   */
  async sendCommand(command: TerminalCommand): Promise<void> {
    try {
      console.log(`Sending to queue: ${this.queueUrl}`);
      
      const message = new SendMessageCommand({
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
      console.log(`Sent command to SQS: ${command.command} (MessageId: ${result.MessageId})`);
    } catch (error) {
      console.error('Error sending command to SQS:', error);
      throw error;
    }
  }

  /**
   * Receive messages from SQS queue (for worker pods)
   */
  async receiveCommands(maxMessages: number = 1): Promise<{ command: TerminalCommand; receiptHandle: string }[]> {
    try {
      const result = await this.sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: 20, // Long polling
        MessageAttributeNames: ['All'],
      }));

      if (!result.Messages || result.Messages.length === 0) {
        return [];
      }

      console.log(`Received ${result.Messages.length} message(s) from queue`);

      return result.Messages.map(msg => ({
        command: JSON.parse(msg.Body || '{}') as TerminalCommand,
        receiptHandle: msg.ReceiptHandle!,
      }));
    } catch (error) {
      console.error('Error receiving commands from SQS:', error);
      return [];
    }
  }

  /**
   * Delete message from queue after processing
   */
  async deleteCommand(receiptHandle: string): Promise<void> {
    try {
      await this.sqsClient.send(new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }));
      console.log('Deleted message from SQS queue');
    } catch (error) {
      console.error('Error deleting message from SQS:', error);
    }
  }
}

let sqsService: SQSService | null = null;

export function getSQSService(): SQSService {
  if (!sqsService) {
    sqsService = new SQSService();
  }
  return sqsService;
}
