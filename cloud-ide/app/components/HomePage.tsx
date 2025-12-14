"use client";
import React, { useState } from 'react';
import Navbar from './Navbar';
import ProjectCard from './ProjectCard';
import CreateProjectDialog from './CreateProjectDialog';
import { Plus, Users, Command, Brain, Clock } from 'lucide-react';

const HomePage = () => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  // Mock data - replace with your backend data later
  const recentProjects = [
    {
      projectName: 'portfolio-v2',
      description: 'Personal portfolio website',
      language: 'React',
      forks: 3,
      lastModified: '2 hours ago',
      icon: 'code' as const,
    },
    {
      projectName: 'chat-server',
      description: 'Real-time websocket implementation',
      language: 'TypeScript',
      forks: 1,
      lastModified: 'Yesterday',
      icon: 'terminal' as const,
    },
    {
      projectName: 'weather-dashboard',
      description: 'Weather visualization app',
      language: 'Vue',
      forks: 5,
      lastModified: '3 days ago',
      icon: 'image' as const,
    },
    {
      projectName: 'ai-code-gen',
      description: 'GPT-4 wrapper service',
      language: 'Python',
      forks: 42,
      lastModified: '1 week ago',
      icon: 'cpu' as const,
    },
  ];

  return (
    <div className='min-h-screen bg-[#0d0d0d]'>
      <Navbar />
      
      <main className='max-w-7xl mx-auto px-6 py-8'>
        {/* Header Section */}
        <div className='flex items-start justify-between mb-8'>
          <div>
            <h1 className='text-4xl font-bold text-white mb-2'>Dashboard</h1>
            <p className='text-gray-400'>Manage your projects and collaborative sessions.</p>
          </div>
          
          <div className='flex gap-3'>
            <button className='flex items-center gap-2 px-5 py-2.5 bg-[#1e1e1e] text-white rounded-lg border border-gray-700 hover:bg-[#2a2a2a] transition-colors'>
              <Users className='w-4 h-4' />
              <span>Join Room</span>
            </button>
            <button 
              onClick={() => setIsCreateDialogOpen(true)}
              className='flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors'
            >
              <Plus className='w-4 h-4' />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Recent Projects Section */}
        <div className='mb-8'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='text-xl font-semibold text-gray-300 uppercase tracking-wide text-sm'>Recent Projects</h2>
            <button className='text-gray-400 hover:text-white'>
              <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 12h16M4 18h16' />
              </svg>
            </button>
          </div>
          
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {recentProjects.map((project, index) => (
              <ProjectCard key={index} {...project} />
            ))}
            
            {/* New Project Card */}
            <div 
              onClick={() => setIsCreateDialogOpen(true)}
              className='bg-[#1e1e1e] border border-dashed border-gray-700 rounded-lg p-5 flex items-center justify-center hover:border-gray-600 transition-all cursor-pointer group min-h-[160px]'
            >
              <div className='text-center'>
                <div className='inline-flex items-center justify-center w-12 h-12 bg-[#2a2a2a] rounded-full mb-3 group-hover:bg-blue-600 transition-colors'>
                  <Plus className='w-6 h-6 text-gray-400 group-hover:text-white' />
                </div>
                <p className='text-gray-400 font-medium'>New Project</p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Cards Section */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-12'>
          <div className='bg-[#1e1e1e] border border-gray-800 rounded-lg p-6 hover:border-blue-500 transition-all'>
            <Command className='w-8 h-8 text-blue-500 mb-3' />
            <h3 className='text-white font-semibold text-lg mb-2'>Command Palette</h3>
            <p className='text-gray-400 text-sm'>Press Cmd+K to access all commands and files instantly.</p>
          </div>
          
          <div className='bg-[#1e1e1e] border border-gray-800 rounded-lg p-6 hover:border-green-500 transition-all'>
            <Brain className='w-8 h-8 text-green-500 mb-3' />
            <h3 className='text-white font-semibold text-lg mb-2'>AI Assistant</h3>
            <p className='text-gray-400 text-sm'>Use the built-in AI chat to generate code and debug errors.</p>
          </div>
          
          <div className='bg-[#1e1e1e] border border-gray-800 rounded-lg p-6 hover:border-purple-500 transition-all'>
            <Clock className='w-8 h-8 text-purple-500 mb-3' />
            <h3 className='text-white font-semibold text-lg mb-2'>Real-time Collab</h3>
            <p className='text-gray-400 text-sm'>Invite friends via room code to code together in real-time.</p>
          </div>
        </div>
      </main>

      {/* Create Project Dialog */}
      <CreateProjectDialog 
        isOpen={isCreateDialogOpen} 
        onClose={() => setIsCreateDialogOpen(false)} 
      />
    </div>
  );
}

export default HomePage;
