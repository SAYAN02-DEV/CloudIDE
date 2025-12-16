'use client';

import React, { useState, useEffect } from 'react';
import { CollaborativeEditor } from '@/app/components/CollaborativeEditor';
import { CollaborativeTerminal } from '@/app/components/CollaborativeTerminal';
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from '@/components/ui/resizable-panels';

interface IDEPageProps {
  projectId: string;
  userId: string;
  username: string;
  token: string;
}

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export default function IDEPage({ projectId, userId, username, token }: IDEPageProps) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalId] = useState(`terminal-${Date.now()}`);
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>(''); // For creating files in specific folder

  useEffect(() => {
    loadProjectFiles();
  }, [projectId]);

  const loadProjectFiles = async () => {
    try {
      const response = await fetch(`/api/v2/projects/${projectId}/files`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('📂 Loaded files:', data.files);
        // Convert flat file list to tree structure
        const tree = buildFileTree(data.files);
        console.log('🌳 File tree:', tree);
        setFiles(tree);
      }
    } catch (error) {
      console.error('Error loading files:', error);
    }
  };

  const buildFileTree = (files: Array<{ path: string }>): FileNode[] => {
    const root: FileNode[] = [];
    const map = new Map<string, FileNode>();

    files.forEach((file) => {
      const filePath = file.path;
      const isFolder = filePath.endsWith('/');
      
      // Remove trailing slash for processing
      const cleanPath = isFolder ? filePath.slice(0, -1) : filePath;
      const parts = cleanPath.split('/');
      let currentPath = '';

      parts.forEach((part, index) => {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!map.has(currentPath)) {
          // A path is a directory if:
          // 1. It's not the last part (intermediate folder)
          // 2. OR the original path ended with '/' (explicit folder)
          const isDir = index < parts.length - 1 || (index === parts.length - 1 && isFolder);
          
          const node: FileNode = {
            name: part,
            path: currentPath,
            isDirectory: isDir,
            children: isDir ? [] : undefined,
          };

          map.set(currentPath, node);

          if (parentPath) {
            const parent = map.get(parentPath);
            if (parent && parent.children) {
              parent.children.push(node);
            }
          } else {
            root.push(node);
          }
        }
      });
    });

    return root;
  };

  const handleFileSelect = async (filePath: string) => {
    try {
      setSelectedFile(filePath);

      const response = await fetch(
        `/api/v2/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setFileContent(data.content);
      }
    } catch (error) {
      console.error('Error loading file:', error);
    }
  };

  const handleFileSave = async (content: string) => {
    if (!selectedFile) return;

    try {
      const response = await fetch(`/api/v2/projects/${projectId}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          path: selectedFile,
          content,
        }),
      });

      if (response.ok) {
        console.log('✅ File saved successfully');
      }
    } catch (error) {
      console.error('Error saving file:', error);
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;

    try {
      // Prepend selected folder path if exists
      const fullPath = selectedFolder 
        ? `${selectedFolder}/${newFileName}` 
        : newFileName;

      const response = await fetch(`/api/v2/projects/${projectId}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          path: fullPath,
          content: '',
        }),
      });

      if (response.ok) {
        setShowNewFileDialog(false);
        setNewFileName('');
        setSelectedFolder('');
        await loadProjectFiles();
        handleFileSelect(fullPath);
      }
    } catch (error) {
      console.error('Error creating file:', error);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      console.log('📁 Creating folder:', newFolderName);
      
      // Prepend selected folder path if exists
      const fullPath = selectedFolder 
        ? `${selectedFolder}/${newFolderName}` 
        : newFolderName;

      const response = await fetch(`/api/v2/projects/${projectId}/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          path: fullPath,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Folder created:', result);
        
        setShowNewFolderDialog(false);
        setNewFolderName('');
        setSelectedFolder('');
        await loadProjectFiles();
      } else {
        const error = await response.text();
        console.error('❌ Failed to create folder:', error);
        alert(`Failed to create folder: ${error}`);
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Error creating folder');
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    if (!confirm(`Delete ${filePath}?`)) return;

    try {
      const response = await fetch(
        `/api/v2/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        if (selectedFile === filePath) {
          setSelectedFile(null);
          setFileContent('');
        }
        await loadProjectFiles();
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  const getFileLanguage = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      html: 'html',
      css: 'css',
      json: 'json',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
    };
    return langMap[ext || ''] || 'plaintext';
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleNewFileInFolder = (folderPath: string) => {
    setSelectedFolder(folderPath);
    setShowNewFileDialog(true);
    closeContextMenu();
  };

  const handleNewFolderInFolder = (folderPath: string) => {
    setSelectedFolder(folderPath);
    setShowNewFolderDialog(true);
    closeContextMenu();
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const renderFileTree = (nodes: FileNode[], level = 0): React.ReactElement => {
    return (
      <div className="select-none">
        {nodes.map((node) => (
          <div key={node.path}>
            <div
              className={`flex items-center justify-between gap-2 px-2 py-1 hover:bg-gray-700 cursor-pointer group ${
                selectedFile === node.path ? 'bg-gray-700' : ''
              }`}
              style={{ paddingLeft: `${level * 16 + 8}px` }}
              onContextMenu={(e) => handleContextMenu(e, node)}
            >
              <div 
                className="flex items-center gap-2 flex-1"
                onClick={() => !node.isDirectory && handleFileSelect(node.path)}
              >
                <span>{node.isDirectory ? '📁' : '📄'}</span>
                <span className="text-sm">{node.name}</span>
              </div>
              {!node.isDirectory && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFile(node.path);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs px-1"
                >
                  ✕
                </button>
              )}
            </div>
            {node.isDirectory && node.children && renderFileTree(node.children, level + 1)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Cloud IDE</h1>
          <span className="text-sm text-gray-400">Project: {projectId}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{username}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* File Explorer */}
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <div className="h-full bg-gray-800 border-r border-gray-700 overflow-y-auto">
              <div className="p-2 border-b border-gray-700 font-semibold text-sm flex items-center justify-between">
                <span>EXPLORER</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowNewFolderDialog(true)}
                    className="text-blue-400 hover:text-blue-300 text-lg leading-none px-1"
                    title="New Folder"
                  >
                    📁+
                  </button>
                  <button
                    onClick={() => setShowNewFileDialog(true)}
                    className="text-green-400 hover:text-green-300 text-xl leading-none"
                    title="New File"
                  >
                    +
                  </button>
                </div>
              </div>
              {renderFileTree(files)}
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* Editor and Terminal */}
          <ResizablePanel defaultSize={80}>
            <ResizablePanelGroup direction="vertical">
              {/* Editor */}
              <ResizablePanel defaultSize={showTerminal ? 60 : 100} minSize={30}>
                <div className="h-full">
                  {selectedFile ? (
                    <CollaborativeEditor
                      projectId={projectId}
                      filePath={selectedFile}
                      userId={userId}
                      username={username}
                      token={token}
                      initialContent={fileContent}
                      language={getFileLanguage(selectedFile)}
                      theme="vs-dark"
                      onSave={handleFileSave}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      Select a file to start editing
                    </div>
                  )}
                </div>
              </ResizablePanel>

              {showTerminal && (
                <>
                  <ResizableHandle />
                  {/* Terminal */}
                  <ResizablePanel defaultSize={40} minSize={20}>
                    <CollaborativeTerminal
                      projectId={projectId}
                      terminalId={terminalId}
                      userId={userId}
                      username={username}
                      token={token}
                      onClose={() => setShowTerminal(false)}
                    />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center justify-between px-4 py-1 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowTerminal(!showTerminal)}
            className="hover:text-white"
          >
            {showTerminal ? '▼ Terminal' : '▲ Terminal'}
          </button>
        </div>
        <div>Ready</div>
      </div>

      {/* New File Dialog */}
      {showNewFileDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-96">
            <h3 className="text-white text-lg font-semibold mb-4">
              Create New File {selectedFolder && `in ${selectedFolder}`}
            </h3>
            {selectedFolder && (
              <p className="text-gray-400 text-sm mb-2">📁 {selectedFolder}/</p>
            )}
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
              placeholder="filename.js"
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white mb-4 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewFileDialog(false);
                  setNewFileName('');
                  setSelectedFolder('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFile}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Dialog */}
      {showNewFolderDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-96">
            <h3 className="text-white text-lg font-semibold mb-4">
              Create New Folder {selectedFolder && `in ${selectedFolder}`}
            </h3>
            {selectedFolder && (
              <p className="text-gray-400 text-sm mb-2">📁 {selectedFolder}/</p>
            )}
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="folder-name or path/to/folder"
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white mb-4 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewFolderDialog(false);
                  setNewFolderName('');
                  setSelectedFolder('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.node.isDirectory ? (
            <>
              <button
                onClick={() => handleNewFileInFolder(contextMenu.node.path)}
                className="w-full text-left px-4 py-2 hover:bg-gray-700 text-white text-sm flex items-center gap-2"
              >
                <span>📄</span> New File
              </button>
              <button
                onClick={() => handleNewFolderInFolder(contextMenu.node.path)}
                className="w-full text-left px-4 py-2 hover:bg-gray-700 text-white text-sm flex items-center gap-2"
              >
                <span>📁</span> New Folder
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                handleDeleteFile(contextMenu.node.path);
                closeContextMenu();
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-700 text-red-400 text-sm flex items-center gap-2"
            >
              <span>🗑️</span> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
