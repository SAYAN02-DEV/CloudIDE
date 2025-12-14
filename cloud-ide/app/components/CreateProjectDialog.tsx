"use client";
import React, { useState } from 'react';
import { X } from 'lucide-react';

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateProjectDialog = ({ isOpen, onClose }: CreateProjectDialogProps) => {
  const [projectName, setProjectName] = useState('');
  const [selectedStack, setSelectedStack] = useState<'React' | 'Node.js' | 'Python' | null>(null);

  if (!isOpen) return null;

  const handleCreate = () => {
    // Your backend logic will go here
    console.log('Creating project:', { projectName, selectedStack });
    // Reset and close
    setProjectName('');
    setSelectedStack(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-[#1e1e1e] border border-gray-800 rounded-lg w-full max-w-md p-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-1">Create Project</h2>
          <p className="text-gray-400 text-sm">Initialize a new workspace.</p>
        </div>

        {/* Project Name Input */}
        <div className="mb-6">
          <label className="block text-white text-sm font-medium mb-2">
            Project Name
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="project-name"
            className="w-full bg-[#0d0d0d] text-white border border-blue-500 rounded-md px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
          />
        </div>

        {/* Stack Selection */}
        <div className="mb-8">
          <label className="block text-white text-sm font-medium mb-3">
            Stack
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setSelectedStack('React')}
              className={`px-4 py-2.5 rounded-md border transition-all ${
                selectedStack === 'React'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-[#2a2a2a] border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              React
            </button>
            <button
              onClick={() => setSelectedStack('Node.js')}
              className={`px-4 py-2.5 rounded-md border transition-all ${
                selectedStack === 'Node.js'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-[#2a2a2a] border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              Node.js
            </button>
            <button
              onClick={() => setSelectedStack('Python')}
              className={`px-4 py-2.5 rounded-md border transition-all ${
                selectedStack === 'Python'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-[#2a2a2a] border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              Python
            </button>
          </div>
        </div>

        {/* Create Button */}
        <div className="flex justify-end">
          <button
            onClick={handleCreate}
            disabled={!projectName || !selectedStack}
            className={`px-6 py-2.5 rounded-md font-medium transition-colors ${
              projectName && selectedStack
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateProjectDialog;
