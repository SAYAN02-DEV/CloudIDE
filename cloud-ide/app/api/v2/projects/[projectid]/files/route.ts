import { NextRequest, NextResponse } from 'next/server';
import { getS3Service } from '@/lib/storage/S3Service';
import jwt from 'jsonwebtoken';
import * as Y from 'yjs';

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

// GET /api/v2/projects/:projectId/files - List all files in a project
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
    const s3Service = getS3Service();
    
    // List CRDT files instead of plain files
    const files = await s3Service.listCRDTFiles(projectId);

    return NextResponse.json(
      {
        files: files.map(f => ({
          path: f.key,
          size: f.size,
          lastModified: f.lastModified,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      { message: 'Failed to list files' },
      { status: 500 }
    );
  }
}

// POST /api/v2/projects/:projectId/files - Create an empty file with CRDT state
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
    const data = await req.json();
    
    if (!data.path) {
      return NextResponse.json(
        { message: 'File path is required' },
        { status: 400 }
      );
    }

    const s3Service = getS3Service();
    
    // Create an empty Yjs document
    const Y = await import('yjs');
    const doc = new Y.Doc();
    const ytext = doc.getText('monaco');
    
    // If content is provided, insert it
    if (data.content) {
      ytext.insert(0, data.content);
    }
    
    // Get the CRDT state
    const state = Y.encodeStateAsUpdate(doc);
    
    // Save empty CRDT state to S3
    await s3Service.saveCRDTState(projectId, data.path, state);
    
    console.log(`Created empty file: ${data.path} with CRDT state (${state.length} bytes)`);

    return NextResponse.json(
      { message: 'File created successfully', path: data.path },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error saving file:', error);
    return NextResponse.json(
      { message: 'Failed to save file' },
      { status: 500 }
    );
  }
}
