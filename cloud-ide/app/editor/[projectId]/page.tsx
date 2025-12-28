'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// Dynamically import IDEPage with no SSR to avoid Monaco Editor window errors
const IDEPage = dynamic(() => import('@/app/components/IDEPage'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p>Loading IDE...</p>
      </div>
    </div>
  ),
});

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');

    if (!token) {
      router.push('/login');
      return;
    }

    setUser({ username: username || 'User' });
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading IDE...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <IDEPage
      projectId={params.projectId as string}
      userId={user.id}
      username={user.username}
      token={localStorage.getItem('token') || ''}
    />
  );
}
