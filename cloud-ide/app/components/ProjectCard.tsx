'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Code, Terminal, Image, Cpu, GitFork } from 'lucide-react';

interface ProjectCardProps {
    projectId?: string;
    projectName: string;
    description: string;
    lastModified: string;
    language: string;
    forks?: number;
    icon?: 'code' | 'terminal' | 'image' | 'cpu';
}

const ProjectCard = ({ projectId, projectName, description, lastModified, language, forks, icon = 'code' }: ProjectCardProps) => {
  const router = useRouter();
  
  const iconMap = {
    code: Code,
    terminal: Terminal,
    image: Image,
    cpu: Cpu,
  };

  const languageColors: { [key: string]: string } = {
    React: 'bg-blue-500',
    TypeScript: 'bg-blue-600',
    Vue: 'bg-green-500',
    Python: 'bg-yellow-500',
  };

  const IconComponent = iconMap[icon];

  const handleClick = () => {
    if (projectId) {
      router.push(`/editor/${projectId}`);
    }
  };

  return (
    <div 
      onClick={handleClick}
      className='bg-[#1e1e1e] border border-gray-800 rounded-lg p-5 hover:border-gray-700 transition-all cursor-pointer group'
    >
      <div className='flex items-start gap-4'>
        <div className='p-3 bg-[#2a2a2a] rounded-lg'>
          <IconComponent className='w-6 h-6 text-gray-400 group-hover:text-blue-500 transition-colors' />
        </div>
        
        <div className='flex-1'>
          <h3 className='text-white font-semibold text-lg mb-1'>{projectName}</h3>
          <p className='text-gray-400 text-sm mb-4'>{description}</p>
          
          <div className='flex items-center gap-4 text-sm'>
            <div className='flex items-center gap-2'>
              <span className={`w-3 h-3 rounded-full ${languageColors[language] || 'bg-gray-500'}`}></span>
              <span className='text-gray-400'>{language}</span>
            </div>
            
            {forks !== undefined && (
              <div className='flex items-center gap-1 text-gray-400'>
                <GitFork className='w-4 h-4' />
                <span>{forks}</span>
              </div>
            )}
            
            <span className='text-gray-500 ml-auto'>{lastModified}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectCard;
