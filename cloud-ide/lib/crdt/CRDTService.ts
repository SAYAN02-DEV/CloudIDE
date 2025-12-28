import * as Y from 'yjs';
import { createClient, RedisClientType } from 'redis';

export class CRDTService {
  private redisClient: RedisClientType;
  private redisPub: RedisClientType;
  private redisSub: RedisClientType;
  private documents: Map<string, Y.Doc>;
  private initialized: boolean = false;

  constructor() {
    this.documents = new Map();
    this.redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    this.redisPub = this.redisClient.duplicate();
    this.redisSub = this.redisClient.duplicate();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await Promise.all([
        this.redisClient.connect(),
        this.redisPub.connect(),
        this.redisSub.connect(),
      ]);
      this.initialized = true;
      console.log('CRDT Service initialized with Redis');
    } catch (error) {
      console.error('Failed to initialize CRDT Service:', error);
      throw error;
    }
  }

  async getDocument(projectId: string, filePath: string): Promise<Y.Doc> {
    const docKey = `${projectId}:${filePath}`;
    
    if (this.documents.has(docKey)) {
      return this.documents.get(docKey)!;
    }

    const doc = new Y.Doc();
    
    // Try to load document from Redis
    const savedState = await this.redisClient.get(`crdt:${docKey}`);
    if (savedState) {
      const update = Buffer.from(savedState, 'base64');
      Y.applyUpdate(doc, update);
    }

    this.documents.set(docKey, doc);
    
    // Set up auto-save on updates
    doc.on('update', async (update: Uint8Array) => {
      await this.saveDocument(projectId, filePath, update);
    });

    return doc;
  }

  async saveDocument(projectId: string, filePath: string, update: Uint8Array): Promise<void> {
    const docKey = `${projectId}:${filePath}`;
    const doc = this.documents.get(docKey);
    
    if (!doc) return;

    // Save full state to Redis
    const state = Y.encodeStateAsUpdate(doc);
    const stateBase64 = Buffer.from(state).toString('base64');
    
    await this.redisClient.set(`crdt:${docKey}`, stateBase64);
    
    // Publish update to all connected clients
    const updateBase64 = Buffer.from(update).toString('base64');
    await this.redisPub.publish(`crdt:update:${docKey}`, updateBase64);
  }

  async subscribeToDocument(
    projectId: string,
    filePath: string,
    callback: (update: Uint8Array) => void
  ): Promise<void> {
    const docKey = `${projectId}:${filePath}`;
    
    await this.redisSub.subscribe(`crdt:update:${docKey}`, (message) => {
      const update = Buffer.from(message, 'base64');
      callback(update);
    });
  }

  async unsubscribeFromDocument(projectId: string, filePath: string): Promise<void> {
    const docKey = `${projectId}:${filePath}`;
    await this.redisSub.unsubscribe(`crdt:update:${docKey}`);
  }

  async applyUpdate(projectId: string, filePath: string, update: Uint8Array): Promise<void> {
    const doc = await this.getDocument(projectId, filePath);
    Y.applyUpdate(doc, update);
  }

  async getDocumentState(projectId: string, filePath: string): Promise<Uint8Array> {
    const doc = await this.getDocument(projectId, filePath);
    return Y.encodeStateAsUpdate(doc);
  }

  async deleteDocument(projectId: string, filePath: string): Promise<void> {
    const docKey = `${projectId}:${filePath}`;
    this.documents.delete(docKey);
    await this.redisClient.del(`crdt:${docKey}`);
  }

  async close(): Promise<void> {
    await Promise.all([
      this.redisClient.quit(),
      this.redisPub.quit(),
      this.redisSub.quit(),
    ]);
    this.initialized = false;
  }
}

// Singleton instance
let crdtService: CRDTService | null = null;

export const getCRDTService = (): CRDTService => {
  if (!crdtService) {
    crdtService = new CRDTService();
  }
  return crdtService;
};
