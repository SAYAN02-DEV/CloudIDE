import mongoose, { Schema, Document, Model } from 'mongoose';

// User Interface
export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

// User Schema
const userSchema = new Schema<IUser>(
  {
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
  },
  {
    timestamps: true,
  }
);

// Project Interface
export interface IProject extends Document {
  name: string;
  description?: string;
  userId: mongoose.Types.ObjectId;
  stack?: string;
  language?: string;
  forks: number;
  createdAt: Date;
  updatedAt: Date;
}

// Project Schema
const projectSchema = new Schema<IProject>(
  {
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
      type: Schema.Types.ObjectId,
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
  },
  {
    timestamps: true,
  }
);

// Session Interface
export interface ISession extends Document {
  userId: mongoose.Types.ObjectId;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

// Session Schema
const sessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
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
  },
  {
    timestamps: true,
  }
);

// ChatMessage Interface
export interface IChatMessage extends Document {
  projectId: string;
  userId: mongoose.Types.ObjectId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  fileOperations?: Array<{
    action: 'create' | 'edit' | 'delete' | 'read';
    path: string;
    content?: string;
    description: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// ChatMessage Schema
const chatMessageSchema = new Schema<IChatMessage>(
  {
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
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
  },
  {
    timestamps: true,
  }
);

// Export Models
export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', userSchema);
export const Project: Model<IProject> = mongoose.models.Project || mongoose.model<IProject>('Project', projectSchema);
export const Session: Model<ISession> = mongoose.models.Session || mongoose.model<ISession>('Session', sessionSchema);
export const ChatMessage: Model<IChatMessage> = mongoose.models.ChatMessage || mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);

