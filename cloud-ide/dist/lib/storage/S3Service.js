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
exports.getS3Service = exports.S3Service = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
class S3Service {
    constructor() {
        const useLocalStack = process.env.USE_LOCALSTACK === 'true' ||
            !process.env.AWS_ACCESS_KEY_ID;
        this.s3Client = new client_s3_1.S3Client({
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
            console.log('🔧 Using LocalStack for S3 (local development)');
            // Auto-create bucket in LocalStack
            this.ensureBucketExists();
        }
    }
    async ensureBucketExists() {
        try {
            const { CreateBucketCommand, HeadBucketCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
            // Check if bucket exists
            try {
                await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
            }
            catch {
                // Bucket doesn't exist, create it
                await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucketName }));
                console.log(`✅ Created S3 bucket: ${this.bucketName}`);
            }
        }
        catch (error) {
            // Suppress "BucketAlreadyOwnedByYou" - it's not an error
            if (error.Code !== 'BucketAlreadyOwnedByYou') {
                console.error('⚠️  Error ensuring bucket exists:', error);
            }
        }
    }
    /**
     * Upload a file or directory to S3 (stores plain text)
     */
    async uploadFile(projectId, filePath, content, contentType) {
        const key = `projects/${projectId}/${filePath}`;
        const command = new client_s3_1.PutObjectCommand({
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
            console.log(`✅ Uploaded file to S3: ${key}`);
        }
        catch (error) {
            console.error(`❌ Error uploading file to S3:`, error);
            throw error;
        }
    }
    /**
     * Save Yjs CRDT state to S3 (binary format)
     */
    async saveCRDTState(projectId, filePath, state) {
        const key = `crdt/${projectId}/${filePath}.yjs`;
        const command = new client_s3_1.PutObjectCommand({
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
            console.log(`✅ Saved CRDT state to S3: ${key} (${state.length} bytes)`);
        }
        catch (error) {
            console.error(`❌ Error saving CRDT state to S3:`, error);
            throw error;
        }
    }
    /**
     * Load Yjs CRDT state from S3
     */
    async loadCRDTState(projectId, filePath) {
        const key = `crdt/${projectId}/${filePath}.yjs`;
        const command = new client_s3_1.GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });
        try {
            const response = await this.s3Client.send(command);
            const stream = response.Body;
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            console.log(`✅ Loaded CRDT state from S3: ${key} (${buffer.length} bytes)`);
            return new Uint8Array(buffer);
        }
        catch (error) {
            if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
                console.log(`📭 No CRDT state found in S3 for: ${key}`);
                return null;
            }
            console.error(`❌ Error loading CRDT state from S3:`, error);
            throw error;
        }
    }
    /**
     * Download a file from S3
     */
    async downloadFile(projectId, filePath) {
        const key = `projects/${projectId}/${filePath}`;
        const command = new client_s3_1.GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });
        try {
            const response = await this.s3Client.send(command);
            const stream = response.Body;
            // Convert stream to buffer
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        }
        catch (error) {
            console.error(`❌ Error downloading file from S3:`, error);
            throw error;
        }
    }
    /**
     * Download file as string
     */
    async downloadFileAsString(projectId, filePath) {
        const buffer = await this.downloadFile(projectId, filePath);
        return buffer.toString('utf-8');
    }
    /**
     * Delete a file from S3
     */
    async deleteFile(projectId, filePath) {
        const key = `projects/${projectId}/${filePath}`;
        const command = new client_s3_1.DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });
        try {
            await this.s3Client.send(command);
            console.log(`✅ Deleted file from S3: ${key}`);
        }
        catch (error) {
            console.error(`❌ Error deleting file from S3:`, error);
            throw error;
        }
    }
    /**
     * List all files in a project
     */
    async listFiles(projectId, prefix = '') {
        const keyPrefix = `projects/${projectId}/${prefix}`;
        const command = new client_s3_1.ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: keyPrefix,
        });
        try {
            const response = await this.s3Client.send(command);
            if (!response.Contents) {
                return [];
            }
            return response.Contents.map((item) => ({
                key: item.Key.replace(`projects/${projectId}/`, ''),
                size: item.Size || 0,
                lastModified: item.LastModified || new Date(),
                contentType: item.StorageClass,
            }));
        }
        catch (error) {
            console.error(`❌ Error listing files from S3:`, error);
            throw error;
        }
    }
    /**
     * Create a folder marker in CRDT storage so it appears in listings
     */
    async createCRDTFolder(projectId, folderPath) {
        // Normalize folder path (no leading slash, ensure trailing slash)
        const normalized = folderPath.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
        const key = `crdt/${projectId}/${normalized}.folder`;
        const command = new client_s3_1.PutObjectCommand({
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
            console.log(`✅ Created CRDT folder marker in S3: ${key}`);
        }
        catch (error) {
            console.error(`❌ Error creating CRDT folder in S3:`, error);
            throw error;
        }
    }
    /**
     * List all CRDT files in a project (removes .yjs extension from filenames)
     */
    async listCRDTFiles(projectId, prefix = '') {
        const keyPrefix = `crdt/${projectId}/${prefix}`;
        const command = new client_s3_1.ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: keyPrefix,
        });
        try {
            const response = await this.s3Client.send(command);
            if (!response.Contents) {
                return [];
            }
            return response.Contents.map((item) => {
                // Remove 'crdt/{projectId}/' prefix and '.yjs' extension
                let filename = item.Key.replace(`crdt/${projectId}/`, '');
                if (filename.endsWith('.yjs')) {
                    filename = filename.slice(0, -4); // Remove .yjs extension
                }
                // Hide folder marker filename, present as folder path (trailing slash)
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
        }
        catch (error) {
            console.error(`❌ Error listing CRDT files from S3:`, error);
            throw error;
        }
    }
    /**
     * Copy a file within S3
     */
    async copyFile(projectId, sourcePath, destinationPath) {
        const sourceKey = `projects/${projectId}/${sourcePath}`;
        const destKey = `projects/${projectId}/${destinationPath}`;
        const command = new client_s3_1.CopyObjectCommand({
            Bucket: this.bucketName,
            CopySource: `${this.bucketName}/${sourceKey}`,
            Key: destKey,
        });
        try {
            await this.s3Client.send(command);
            console.log(`✅ Copied file in S3: ${sourceKey} -> ${destKey}`);
        }
        catch (error) {
            console.error(`❌ Error copying file in S3:`, error);
            throw error;
        }
    }
    /**
     * Get a presigned URL for direct download
     */
    async getPresignedDownloadUrl(projectId, filePath, expiresIn = 3600) {
        const key = `projects/${projectId}/${filePath}`;
        const command = new client_s3_1.GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });
        try {
            const url = await (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, command, { expiresIn });
            return url;
        }
        catch (error) {
            console.error(`❌ Error generating presigned URL:`, error);
            throw error;
        }
    }
    /**
     * Delete all files in a project (used when deleting a project)
     */
    async deleteProject(projectId) {
        const files = await this.listFiles(projectId);
        for (const file of files) {
            await this.deleteFile(projectId, file.key);
        }
        console.log(`✅ Deleted all files for project ${projectId}`);
    }
    /**
     * Sync entire project directory to S3
     */
    async syncProjectToS3(projectId, files) {
        const uploadPromises = files.map((file) => this.uploadFile(projectId, file.path, file.content, file.contentType));
        await Promise.all(uploadPromises);
        console.log(`✅ Synced ${files.length} files to S3 for project ${projectId}`);
    }
    /**
     * Download entire project from S3
     */
    async downloadProject(projectId) {
        const files = await this.listFiles(projectId);
        const fileMap = new Map();
        for (const file of files) {
            const content = await this.downloadFile(projectId, file.key);
            fileMap.set(file.key, content);
        }
        return fileMap;
    }
}
exports.S3Service = S3Service;
// Singleton instance
let s3Service = null;
const getS3Service = () => {
    if (!s3Service) {
        s3Service = new S3Service();
    }
    return s3Service;
};
exports.getS3Service = getS3Service;
