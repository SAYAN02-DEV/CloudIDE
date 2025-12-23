import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/db';
import { ChatMessage } from '@/db/schema';
import { getChatService } from '@/lib/ai/ChatService';
import { getS3Service } from '@/lib/storage/S3Service';
import jwt from 'jsonwebtoken';

function verifyToken(req: NextRequest): { userId: string; username: string } | null {
  const authHeader = req.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    return { userId: decoded.userId, username: decoded.username };
  } catch (error) {
    return null;
  }
}

// POST /api/v2/projects/:projectId/chat - Send message to AI chatbot
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = verifyToken(req);
    
    if (!user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { projectId } = await params;
    const { message } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { message: 'Message is required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Get project files for context
    const s3Service = getS3Service();
    const projectFiles = await s3Service.listCRDTFiles(projectId);
    const filePaths = projectFiles.map(f => f.key);

    // Process message with AI
    const chatService = getChatService();
    const response = await chatService.processUserMessage(
      projectId,
      message,
      filePaths
    );

    // Save user message to database
    const userMessage = new ChatMessage({
      projectId,
      userId: user.userId,
      role: 'user',
      content: message,
      timestamp: new Date(),
    });
    await userMessage.save();

    // Save AI response to database
    const aiMessage = new ChatMessage({
      projectId,
      userId: user.userId,
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
      fileOperations: response.fileOperations,
    });
    await aiMessage.save();

    return NextResponse.json({
      message: response.message,
      fileOperations: response.fileOperations,
      success: response.success,
      error: response.error,
      messageId: aiMessage._id.toString(),
    });

  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { 
        message: 'Failed to process chat message',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET /api/v2/projects/:projectId/chat - Get chat history
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = verifyToken(req);
    
    if (!user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { projectId } = await params;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    await connectDB();

    const messages = await ChatMessage.find({
      projectId,
      userId: user.userId,
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      messages: messages.reverse().map(msg => ({
        id: msg._id.toString(),
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        fileOperations: msg.fileOperations || [],
      })),
    });

  } catch (error) {
    console.error('Error fetching chat history:', error);
    return NextResponse.json(
      { message: 'Failed to fetch chat history' },
      { status: 500 }
    );
  }
}