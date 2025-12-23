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
exports.getCRDTService = exports.CRDTService = void 0;
const Y = __importStar(require("yjs"));
const redis_1 = require("redis");
class CRDTService {
    constructor() {
        this.initialized = false;
        this.documents = new Map();
        this.redisClient = (0, redis_1.createClient)({
            socket: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
            },
            password: process.env.REDIS_PASSWORD || undefined,
        });
        this.redisPub = this.redisClient.duplicate();
        this.redisSub = this.redisClient.duplicate();
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            await Promise.all([
                this.redisClient.connect(),
                this.redisPub.connect(),
                this.redisSub.connect(),
            ]);
            this.initialized = true;
            console.log('✅ CRDT Service initialized with Redis');
        }
        catch (error) {
            console.error('❌ Failed to initialize CRDT Service:', error);
            throw error;
        }
    }
    async getDocument(projectId, filePath) {
        const docKey = `${projectId}:${filePath}`;
        if (this.documents.has(docKey)) {
            return this.documents.get(docKey);
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
        doc.on('update', async (update) => {
            await this.saveDocument(projectId, filePath, update);
        });
        return doc;
    }
    async saveDocument(projectId, filePath, update) {
        const docKey = `${projectId}:${filePath}`;
        const doc = this.documents.get(docKey);
        if (!doc)
            return;
        // Save full state to Redis
        const state = Y.encodeStateAsUpdate(doc);
        const stateBase64 = Buffer.from(state).toString('base64');
        await this.redisClient.set(`crdt:${docKey}`, stateBase64);
        // Publish update to all connected clients
        const updateBase64 = Buffer.from(update).toString('base64');
        await this.redisPub.publish(`crdt:update:${docKey}`, updateBase64);
    }
    async subscribeToDocument(projectId, filePath, callback) {
        const docKey = `${projectId}:${filePath}`;
        await this.redisSub.subscribe(`crdt:update:${docKey}`, (message) => {
            const update = Buffer.from(message, 'base64');
            callback(update);
        });
    }
    async unsubscribeFromDocument(projectId, filePath) {
        const docKey = `${projectId}:${filePath}`;
        await this.redisSub.unsubscribe(`crdt:update:${docKey}`);
    }
    async applyUpdate(projectId, filePath, update) {
        const doc = await this.getDocument(projectId, filePath);
        Y.applyUpdate(doc, update);
    }
    async getDocumentState(projectId, filePath) {
        const doc = await this.getDocument(projectId, filePath);
        return Y.encodeStateAsUpdate(doc);
    }
    async deleteDocument(projectId, filePath) {
        const docKey = `${projectId}:${filePath}`;
        this.documents.delete(docKey);
        await this.redisClient.del(`crdt:${docKey}`);
    }
    async close() {
        await Promise.all([
            this.redisClient.quit(),
            this.redisPub.quit(),
            this.redisSub.quit(),
        ]);
        this.initialized = false;
    }
}
exports.CRDTService = CRDTService;
// Singleton instance
let crdtService = null;
const getCRDTService = () => {
    if (!crdtService) {
        crdtService = new CRDTService();
    }
    return crdtService;
};
exports.getCRDTService = getCRDTService;
