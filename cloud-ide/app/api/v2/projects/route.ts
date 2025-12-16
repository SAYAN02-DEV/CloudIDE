import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/db';
import { Project } from '@/db/schema';
import { getS3Service } from '@/lib/storage/S3Service';
import jwt from 'jsonwebtoken';

// Middleware to verify JWT token
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

// GET /api/v2/projects - List all projects for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const user = verifyToken(req);
    
    if (!user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    await connectDB();
    
    const projects = await Project.find({ userId: user.userId })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json(
      { 
        projects: projects.map(p => ({
          id: p._id.toString(),
          name: p.name,
          description: p.description,
          stack: p.stack,
          language: p.language,
          forks: p.forks,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }))
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { message: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// POST /api/v2/projects - Create a new project
export async function POST(req: NextRequest) {
  try {
    const user = verifyToken(req);
    
    if (!user) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    await connectDB();
    
    const data = await req.json();
    
    if (!data.name) {
      return NextResponse.json(
        { message: 'Project name is required' },
        { status: 400 }
      );
    }

    const project = new Project({
      name: data.name,
      description: data.description || '',
      userId: user.userId,
      stack: data.stack || 'Other',
      language: data.language || 'JavaScript',
      forks: 0,
    });

    await project.save();

    // Create initial project structure in S3
    const s3Service = getS3Service();
    
    const initialFiles = [
      {
        path: 'README.md',
        content: `# ${data.name}\n\n${data.description || 'A Cloud IDE project'}\n`,
        contentType: 'text/markdown',
      },
      {
        path: 'index.js',
        content: '// Start coding here\nconsole.log("Hello, World!");\n',
        contentType: 'application/javascript',
      },
    ];

    await s3Service.syncProjectToS3(project._id.toString(), initialFiles);

    return NextResponse.json(
      {
        message: 'Project created successfully',
        project: {
          id: project._id.toString(),
          name: project.name,
          description: project.description,
          stack: project.stack,
          language: project.language,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { message: 'Failed to create project' },
      { status: 500 }
    );
  }
}
