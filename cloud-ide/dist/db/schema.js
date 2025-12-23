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
exports.ChatMessage = exports.Session = exports.Project = exports.User = void 0;
const mongoose_1 = __importStar(require("mongoose"));
// User Schema
const userSchema = new mongoose_1.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: true,
    },
}, {
    timestamps: true,
});
// Project Schema
const projectSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        trim: true,
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    stack: {
        type: String,
        enum: ['React', 'Node.js', 'Python', 'Vue', 'TypeScript', 'Other'],
    },
    language: {
        type: String,
    },
    forks: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});
// Session Schema
const sessionSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    token: {
        type: String,
        required: true,
        unique: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
}, {
    timestamps: true,
});
// ChatMessage Schema
const chatMessageSchema = new mongoose_1.Schema({
    projectId: {
        type: String,
        required: true,
        index: true,
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    role: {
        type: String,
        enum: ['user', 'assistant', 'system'],
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },
    fileOperations: [{
            action: {
                type: String,
                enum: ['create', 'edit', 'delete', 'read'],
                required: true,
            },
            path: {
                type: String,
                required: true,
            },
            content: {
                type: String,
            },
            description: {
                type: String,
                required: true,
            },
        }],
}, {
    timestamps: true,
});
// Export Models
exports.User = mongoose_1.default.models.User || mongoose_1.default.model('User', userSchema);
exports.Project = mongoose_1.default.models.Project || mongoose_1.default.model('Project', projectSchema);
exports.Session = mongoose_1.default.models.Session || mongoose_1.default.model('Session', sessionSchema);
exports.ChatMessage = mongoose_1.default.models.ChatMessage || mongoose_1.default.model('ChatMessage', chatMessageSchema);
