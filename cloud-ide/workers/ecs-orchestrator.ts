import { config } from 'dotenv';
config();

import { getECSTaskService } from '../lib/ecs/ECSTaskService';
import { getSQSService } from '../lib/queue/SQSService';

/**
 * ECS Task Orchestrator
 * Monitors SQS queue and auto-scales ECS Fargate tasks
 */
class ECSOrchestrator {
  private ecsService: ReturnType<typeof getECSTaskService>;
  private sqsService: ReturnType<typeof getSQSService>;
  private isRunning: boolean = false;
  private checkInterval: number = 30000; // Check every 30 seconds

  constructor() {
    this.ecsService = getECSTaskService();
    this.sqsService = getSQSService();
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

  private async monitorAndScale() {
    while (this.isRunning) {
      try {
        // Get queue depth
        const queueDepth = await this.getQueueDepth();
        
        // Auto-scale based on queue depth
        await this.ecsService.autoScaleWorkers(
          queueDepth,
          parseInt(process.env.ECS_MIN_TASKS || '1'),
          parseInt(process.env.ECS_MAX_TASKS || '10'),
          parseInt(process.env.ECS_MESSAGES_PER_TASK || '5')
        );

        // Wait before next check
        await this.sleep(this.checkInterval);
      } catch (error) {
        console.error('❌ Error in monitoring loop:', error);
        await this.sleep(this.checkInterval);
      }
    }
  }

  private async getQueueDepth(): Promise<number> {
    // Use SQS GetQueueAttributes to get approximate number of messages
    const { SQSClient, GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');
    
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
    } catch (error) {
      console.error('❌ Error getting queue depth:', error);
      return 0;
    }
  }

  private sleep(ms: number): Promise<void> {
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

export default ECSOrchestrator;
