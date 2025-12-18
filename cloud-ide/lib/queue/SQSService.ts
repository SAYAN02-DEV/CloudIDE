import {
    SQSClient,
    SendMessageCommand,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    GetQueueUrlCommand,
    CreateQueueCommand
} from '@aws-sdk/client-sqs'
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
    

}