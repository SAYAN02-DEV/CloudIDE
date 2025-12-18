import {
    SQSClient,
    SendMessageCommand,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    GetQueueUrlCommand,
    CreateQueueCommand
} from '@aws-sdk/client-sqs'
import { promises } from 'dns';
import { UNDERSCORE_NOT_FOUND_ROUTE } from 'next/dist/shared/lib/entry-constants';

export interface TerminalCommand {
    projectId: string;
    terminalId: string; 
    userId: string;
    userrname: string;
    command: string;
    timestamp: number;
}

export class SQSService {
    private sqsClient: SQSClient;
    private queueUrl: string;
    private useLocalStack: boolean;
    private initialized: boolean = false;

    constructor() {
        this.useLocalStack = process.env.USE_LOCALSTACK === 'true' || !process.env.AWS_ACESS_KEY_ID;
        const region = this.useLocalStack?'us-east-1':(process.env.AWS_REGION || 'us-east-1');
        this.sqsClient = new SQSClient({
            region,
            endpoint: this.useLocalStack ? 'http://localhost:4566' : undefined,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
            },
        });

        this.queueUrl = process.env.AWS_SQS_QUEUE_URL || 'http://localhost:4566/000000000000/cloudide-terminal-queue';
    }

    private async ensureQueueExist(){
        try{
            try{
                const getUrlResult = await this.sqsClient.send(new GetQueueUrlCommand({
                    QueueName: 'cloudide-terminal-queue'
                }));
                if(getUrlResult.QueueUrl){
                    this.queueUrl = getUrlResult.QueueUrl;
                    console.log(`SQS queue exist ${this.queueUrl}`);
                }
            }catch{
                const command = new CreateQueueCommand({
                    QueueName: 'cloudide-terminal-queue',
                    Attributes: {
                        VisibilityTimeout: '300',
                        MessageRetentionPeriod: '1209600',
                    }
                });
                const result = await this.sqsClient.send(command);
                if(result.QueueUrl){
                    this.queueUrl = result.QueueUrl;
                }
                console.log(`created SQS queue: ${this.queueUrl}`);
            }
        }catch(err){
            console.error('Error ensuring SQS queue exists:', err);
        }
    }
    //must be called before use
    async initialize(){
        if(this.initialized){
            return;
        }
        if(this.useLocalStack){
            await this.ensureQueueExist();
        }
        this.initialized = true;
        console.log(`SQS Service initialized with queue URL: ${this.queueUrl}`);
    }

    async sendCommand(recievedCommand: TerminalCommand): Promise<void> {
        try{
            console.log(`sending command to queue ${this.queueUrl}`);
            const command = new SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: JSON.stringify(recievedCommand),
                MessageAttributes: {
                projectId: {
                    DataType: 'String',
                    StringValue: recievedCommand.projectId,
                },
                terminalId: {
                    DataType: 'String',
                    StringValue: recievedCommand.terminalId,
                },
                userId: {
                    DataType: 'String',
                    StringValue: recievedCommand.userId,
                },
                },
            });
            const result = await this.sqsClient.send(command);
            console.log(`Sent command to SQS: ${recievedCommand.command} (MessageId: ${result.MessageId}`)
        }catch(err){
            console.log(`Error sending command to SQS:`, err);
            throw err;
        }
    }

    async receiveCommands(maxMesages: number = 1): Promise<{ receivedCommand: TerminalCommand; receiptHandle: string }[]>{
        try{
            const command = new ReceiveMessageCommand({
                QueueUrl: this.queueUrl,
                MaxNumberOfMessages:maxMesages,
                WaitTimeSeconds:20,
                MessageAttributeNames: ['All'],
            });
            const result = await this.sqsClient.send(command);
            if(!result.Messages || result.Messages.length === 0){
                return [];
            }
            console.log(`Received ${result.Messages.length} message from queue`);
            return result.Messages.filter(msg => msg.ReceiptHandle !== undefined).map(msg =>({
                receivedCommand: JSON.parse(msg.Body || '{}') as TerminalCommand,
                receiptHandle: msg.ReceiptHandle!,
            }));
        }catch(error){
            console.error('Error receiving commands from SQS:', error);
            return [];
        }

    }

    async deleteCommand(receiptHandle: string): Promise<void> {
        try{
            const command = new DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: receiptHandle,
            });
            await this.sqsClient.send(command);
        }catch(err){
            console.log(`error is ${err}`);
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