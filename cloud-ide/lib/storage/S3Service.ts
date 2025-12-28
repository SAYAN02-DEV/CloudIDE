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

  // save CRDT state
  async saveCRDTState(
    projectId: string,
    filePath: string,
    state: Uint8Array
  ): Promise<void> {
    const key = `crdt/${projectId}/${filePath}.yjs`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: Buffer.from(state),
      ContentType: 'application/octet-stream',
      Metadata: {
        projectId,
        filePath,
        format: 'yjs-crdt',
        uploadedAt: new Date().toISOString(),
      },
    });

    try {
      await this.s3Client.send(command);
      console.log(`Saved CRDT state to S3: ${key} (${state.length} bytes)`);
    } catch (error) {
      console.error(`Error saving CRDT state to S3:`, error);
      throw error;
    }
  }

  // load CRDT state
  async loadCRDTState(
    projectId: string,
    filePath: string
  ): Promise<Uint8Array | null> {
    const key = `crdt/${projectId}/${filePath}.yjs`;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const response = await this.s3Client.send(command);
      const stream = response.Body as any;
      
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const buffer = Buffer.concat(chunks);
      console.log(`Loaded CRDT state from S3: ${key} (${buffer.length} bytes)`);
      return new Uint8Array(buffer);
    } catch (error: any) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        console.log(`No CRDT state found in S3 for: ${key}`);
        return null;
      }
      console.error(`Error loading CRDT state from S3:`, error);
      throw error;
    }
  }

  // download file from s3
  async downloadFile(projectId: string, filePath: string): Promise<Buffer> {
    const key = `projects/${projectId}/${filePath}`;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const response = await this.s3Client.send(command);
      const stream = response.Body as any;
      
      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      console.error(`Error downloading file from S3:`, error);
      throw error;
    }
  }
  // download file as a string
  async downloadFileAsString(projectId: string, filePath: string): Promise<string> {
    const buffer = await this.downloadFile(projectId, filePath);
    return buffer.toString('utf-8');
  }

  // delete file from s3
  async deleteFile(projectId: string, filePath: string): Promise<void> {
    const key = `projects/${projectId}/${filePath}`;

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
      console.log(`Deleted file from S3: ${key}`);
    } catch (error) {
      console.error(`Error deleting file from S3:`, error);
      throw error;
    }
  }

  // /list files in a project
  async listFiles(projectId: string, prefix: string = ''): Promise<S3FileMetadata[]> {
    const keyPrefix = `projects/${projectId}/${prefix}`;

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: keyPrefix,
    });

    try {
      const response = await this.s3Client.send(command);
      
      if (!response.Contents) {
        return [];
      }

      return response.Contents.map((item) => ({
        key: item.Key!.replace(`projects/${projectId}/`, ''),
        size: item.Size || 0,
        lastModified: item.LastModified || new Date(),
        contentType: item.StorageClass,
      }));
    } catch (error) {
      console.error(`Error listing files from S3:`, error);
      throw error;
    }
  }

  // creating a folder
  async createCRDTFolder(projectId: string, folderPath: string): Promise<void> {
    // Normalize folder path (no leading slash, ensure trailing slash)
    const normalized = folderPath.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
    const key = `crdt/${projectId}/${normalized}.folder`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: Buffer.from(''),
      ContentType: 'application/octet-stream',
      Metadata: {
        projectId,
        folderPath: normalized,
        type: 'folder',
        uploadedAt: new Date().toISOString(),
      },
    });

    try {
      await this.s3Client.send(command);
      console.log(`Created CRDT folder marker in S3: ${key}`);
    } catch (error) {
      console.error(`Error creating CRDT folder in S3:`, error);
      throw error;
    }
  }

  // listing files in a project
  async listCRDTFiles(projectId: string, prefix: string = ''): Promise<S3FileMetadata[]> {
    const keyPrefix = `crdt/${projectId}/${prefix}`;

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: keyPrefix,
    });

    try {
      const response = await this.s3Client.send(command);
      
      if (!response.Contents) {
        return [];
      }

      return response.Contents.map((item) => {
        let filename = item.Key!.replace(`crdt/${projectId}/`, '');
        if (filename.endsWith('.yjs')) {
          filename = filename.slice(0, -4);
        }
        if (filename.endsWith('.folder')) {
          filename = filename.replace(/\.folder$/, '/');
        }
        
        return {
          key: filename,
          size: item.Size || 0,
          lastModified: item.LastModified || new Date(),
          contentType: item.StorageClass,
        };
      });
    } catch (error) {
      console.error(`Error listing CRDT files from S3:`, error);
      throw error;
    }
  }

  // copy a file within s3
  async copyFile(
    projectId: string,
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    const sourceKey = `projects/${projectId}/${sourcePath}`;
    const destKey = `projects/${projectId}/${destinationPath}`;

    const command = new CopyObjectCommand({
      Bucket: this.bucketName,
      CopySource: `${this.bucketName}/${sourceKey}`,
      Key: destKey,
    });

    try {
      await this.s3Client.send(command);
      console.log(`Copied file in S3: ${sourceKey} -> ${destKey}`);
    } catch (error) {
      console.error(`Error copying file in S3:`, error);
      throw error;
    }
  }

  // getting url for download
  async getPresignedDownloadUrl(
    projectId: string,
    filePath: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const key = `projects/${projectId}/${filePath}`;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      console.error(`Error generating presigned URL:`, error);
      throw error;
    }
  }

  // deleteing whole project
  async deleteProject(projectId: string): Promise<void> {
    const files = await this.listFiles(projectId);

    for (const file of files) {
      await this.deleteFile(projectId, file.key);
    }

    console.log(`Deleted all files for project ${projectId}`);
  }

  // uploading the whole project
  async syncProjectToS3(
    projectId: string,
    files: Array<{ path: string; content: Buffer | string; contentType?: string }>
  ): Promise<void> {
    const uploadPromises = files.map((file) =>
      this.uploadFile(projectId, file.path, file.content, file.contentType)
    );

    await Promise.all(uploadPromises);
    console.log(`Synced ${files.length} files to S3 for project ${projectId}`);
  }

  // downloading complete project
  async downloadProject(projectId: string): Promise<Map<string, Buffer>> {
    const files = await this.listFiles(projectId);
    const fileMap = new Map<string, Buffer>();

    for (const file of files) {
      const content = await this.downloadFile(projectId, file.key);
      fileMap.set(file.key, content);
    }

    return fileMap;
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
