import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/db';
import { Project } from '@/db/schema';
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

// GET /api/v2/projects/:projectId - Get project details
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
    await connectDB();
    
    const project = await Project.findById(projectId);

    if (!project) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      );
    }

    // Check if user owns the project
    if (project.userId.toString() !== user.userId) {
      return NextResponse.json(
        { message: 'Forbidden' },
        { status: 403 }
      );
    }

    // Get file list from S3
    const s3Service = getS3Service();
    const files = await s3Service.listFiles(projectId);

    return NextResponse.json(
      {
        project: {
          id: project._id.toString(),
          name: project.name,
          description: project.description,
          stack: project.stack,
          language: project.language,
          forks: project.forks,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        files: files.map(f => ({
          path: f.key,
          size: f.size,
          lastModified: f.lastModified,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { message: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

// PUT /api/v2/projects/:projectId - Update project details
export async function PUT(
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
    await connectDB();
    
    const project = await Project.findById(projectId);

    if (!project) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      );
    }

    if (project.userId.toString() !== user.userId) {
      return NextResponse.json(
        { message: 'Forbidden' },
        { status: 403 }
      );
    }

    const data = await req.json();

    if (data.name) project.name = data.name;
    if (data.description !== undefined) project.description = data.description;
    if (data.stack) project.stack = data.stack;
    if (data.language) project.language = data.language;

    await project.save();

    return NextResponse.json(
      {
        message: 'Project updated successfully',
        project: {
          id: project._id.toString(),
          name: project.name,
          description: project.description,
          stack: project.stack,
          language: project.language,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { message: 'Failed to update project' },
      { status: 500 }
    );
  }
}

// DELETE /api/v2/projects/:projectId - Delete a project
export async function DELETE(
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
    await connectDB();
    
    const project = await Project.findById(projectId);

    if (!project) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      );
    }

    if (project.userId.toString() !== user.userId) {
      return NextResponse.json(
        { message: 'Forbidden' },
        { status: 403 }
      );
    }

    // Delete all files from S3
    const s3Service = getS3Service();
    await s3Service.deleteProject(projectId);

    // Delete project from database
    await Project.findByIdAndDelete(projectId);

    return NextResponse.json(
      { message: 'Project deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { message: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
