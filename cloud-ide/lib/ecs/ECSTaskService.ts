import {
  ECSClient,
  RunTaskCommand,
  DescribeTasksCommand,
  ListTasksCommand,
  StopTaskCommand,
  TaskOverride,
} from '@aws-sdk/client-ecs';

export interface ECSTaskConfig {
  cluster: string;
  taskDefinition: string;
  subnets: string[];
  securityGroups: string[];
  assignPublicIp?: boolean;
}

export class ECSTaskService {
  private ecsClient: ECSClient;
  private config: ECSTaskConfig;

  constructor(config: ECSTaskConfig) {
    this.ecsClient = new ECSClient({
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
  async launchWorkerTask(
    taskCount: number = 1,
    environmentOverrides?: Record<string, string>
  ): Promise<string[]> {
    const containerOverrides: TaskOverride['containerOverrides'] = [];

    if (environmentOverrides) {
      containerOverrides.push({
        name: 'cloudide-worker', // Must match container name in task definition
        environment: Object.entries(environmentOverrides).map(([name, value]) => ({
          name,
          value,
        })),
      });
    }

    const command = new RunTaskCommand({
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
    } catch (error) {
      console.error('❌ Error launching ECS task:', error);
      throw error;
    }
  }

  /**
   * Get the number of running worker tasks
   */
  async getRunningTaskCount(): Promise<number> {
    const command = new ListTasksCommand({
      cluster: this.config.cluster,
      family: this.config.taskDefinition.split(':')[0], // Get task family without version
      desiredStatus: 'RUNNING',
    });

    try {
      const response = await this.ecsClient.send(command);
      return response.taskArns?.length || 0;
    } catch (error) {
      console.error('❌ Error getting running task count:', error);
      return 0;
    }
  }

  /**
   * Get detailed information about tasks
   */
  async describeTasks(taskArns: string[]): Promise<any[]> {
    if (taskArns.length === 0) return [];

    const command = new DescribeTasksCommand({
      cluster: this.config.cluster,
      tasks: taskArns,
    });

    try {
      const response = await this.ecsClient.send(command);
      return response.tasks || [];
    } catch (error) {
      console.error('❌ Error describing tasks:', error);
      return [];
    }
  }

  /**
   * Stop a running task
   */
  async stopTask(taskArn: string, reason?: string): Promise<void> {
    const command = new StopTaskCommand({
      cluster: this.config.cluster,
      task: taskArn,
      reason: reason || 'Manual stop',
    });

    try {
      await this.ecsClient.send(command);
      console.log(`✅ Stopped ECS task: ${taskArn}`);
    } catch (error) {
      console.error('❌ Error stopping task:', error);
      throw error;
    }
  }

  /**
   * Auto-scale worker tasks based on SQS queue depth
   */
  async autoScaleWorkers(
    queueDepth: number,
    minTasks: number = 1,
    maxTasks: number = 10,
    messagesPerTask: number = 5
  ): Promise<void> {
    const currentRunning = await this.getRunningTaskCount();
    const desiredTasks = Math.min(
      Math.max(Math.ceil(queueDepth / messagesPerTask), minTasks),
      maxTasks
    );

    console.log(`📊 Queue depth: ${queueDepth}, Current tasks: ${currentRunning}, Desired: ${desiredTasks}`);

    if (desiredTasks > currentRunning) {
      const tasksToLaunch = desiredTasks - currentRunning;
      console.log(`🚀 Scaling up: Launching ${tasksToLaunch} new task(s)`);
      await this.launchWorkerTask(tasksToLaunch);
    }
    // Note: Tasks will automatically stop when queue is empty (no work to do)
  }
}

let ecsTaskService: ECSTaskService | null = null;

export function getECSTaskService(): ECSTaskService {
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
