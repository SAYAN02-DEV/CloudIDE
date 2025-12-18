import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3FileMetadata {
  key: string;
  size: number;
  lastModified: Date;
  contentType?: string;
}

export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    const useLocalStack = process.env.USE_LOCALSTACK === 'true' || !process.env.AWS_ACCESS_KEY_ID;
    
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: useLocalStack ? 'http://localhost:4566' : undefined,
      forcePathStyle: useLocalStack, // Required for LocalStack
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    });
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || 'cloudide-projects';
    
    if (useLocalStack) {
      console.log('Using LocalStack for S3 (local development)');
      // Auto-create bucket in LocalStack
      this.ensureBucketExists();
    }
  }

  private async ensureBucketExists() {
    try {
      const { CreateBucketCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3');
      try {
        await this.s3Client.send(new HeadBucketCommand(
          {Bucket: this.bucketName}
        ))
      } catch {
        await this.s3Client.send(new CreateBucketCommand(
          {Bucket: this.bucketName}
        ))
        console.log(`Created S3 bucket: ${this.bucketName}`);
      }
    } catch (error) {
      console.error('Error ensuring bucket exists:', error);
    }
  }

  //  Upload a file or directory
  async uploadFile(
    projectId: string,
    filePath: string,
    content: Buffer | string,
    contentType?: string
  ): Promise<void> {
    const key = `projects/${projectId}/${filePath}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: content,
      ContentType: contentType || 'application/octet-stream',
      Metadata: {
        projectId,
        uploadedAt: new Date().toISOString(),
      },
    });

    try {
      await this.s3Client.send(command);
      console.log(`Uploaded file to S3: ${key}`);
    } catch (error) {
      console.error(`Error uploading file to S3:`, error);
      throw error;
    }
  }

  
}

// Singleton instance
let s3Service: S3Service | null = null;

export const getS3Service = (): S3Service => {
  if (!s3Service) {
    s3Service = new S3Service();
  }
  return s3Service;
};
