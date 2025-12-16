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

// GET /api/v2/projects/:projectId/files/:path - Get file content (convert CRDT to text)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; path: string }> }
) {
  try {
    const user = verifyToken(req);
    
    if (!user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { projectId, path } = await params;
    // Decode the path parameter (it's URL encoded)
    const filePath = decodeURIComponent(path);

    const s3Service = getS3Service();
    
    // Load CRDT state from S3
    const crdtState = await s3Service.loadCRDTState(projectId, filePath);
    
    if (!crdtState) {
      // File doesn't exist yet, return empty content
      return NextResponse.json(
        {
          path: filePath,
          content: '',
        },
        { status: 200 }
      );
    }
    
    // Convert CRDT state to plain text
    const doc = new Y.Doc();
    Y.applyUpdate(doc, crdtState);
    const ytext = doc.getText('monaco');
    const content = ytext.toString();

    return NextResponse.json(
      {
        path: filePath,
        content,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error getting file:', error);
    return NextResponse.json(
      { message: 'Failed to get file' },
      { status: 500 }
    );
  }
}

// DELETE /api/v2/projects/:projectId/files/:path - Delete a file
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; path: string }> }
) {
  try {
    const user = verifyToken(req);
    
    if (!user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { projectId, path } = await params;
    const filePath = decodeURIComponent(path);

    const s3Service = getS3Service();
    await s3Service.deleteFile(projectId, filePath);

    return NextResponse.json(
      { message: 'File deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { message: 'Failed to delete file' },
      { status: 500 }
    );
  }
}
