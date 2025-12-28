import { NextRequest } from 'next/server';
import { getS3Service } from '@/lib/storage/S3Service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await req.json();
    const folderPath: string = (body?.path || '').trim();

    console.log(`📁 Creating folder "${folderPath}" in project ${projectId}`);

    if (!folderPath) {
      return new Response(JSON.stringify({ error: 'Missing folder path' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Prevent path traversal and invalid names
    if (folderPath.includes('..')) {
      return new Response(JSON.stringify({ error: 'Invalid folder path' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const s3 = getS3Service();
    await s3.createCRDTFolder(projectId, folderPath);

    const normalizedPath = folderPath.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
    console.log(`✅ Folder created: ${normalizedPath}`);

    return new Response(
      JSON.stringify({ ok: true, path: normalizedPath }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error creating folder:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
