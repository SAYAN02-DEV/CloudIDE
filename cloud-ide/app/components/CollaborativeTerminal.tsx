'use client';

import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface CollaborativeTerminalProps {
  projectId: string;
  terminalId: string;
  userId: string;
  username: string;
  token: string;
  onClose?: () => void;
}

export const CollaborativeTerminal: React.FC<CollaborativeTerminalProps> = ({
  projectId,
  terminalId,
  userId,
  username,
  token,
  onClose,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPath, setCurrentPath] = useState('~');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

    const socket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Terminal connected to WebSocket server');
      setIsConnected(true);

      // Join project
      socket.emit('join-project', { projectId });

      // Subscribe to terminal output
      socket.emit('subscribe-terminal', { projectId, terminalId });

      // Initialize terminal session
      socket.emit('terminal-init', { projectId, terminalId });

      // Send initial welcome message
      setOutput((prev) => [
        ...prev,
        `Welcome to Cloud IDE Terminal`,
        `Project: ${projectId}`,
        `Terminal ID: ${terminalId}`,
        `User: ${username}`,
        '---',
        'Initializing terminal session...',
        '',
      ]);
    });

    socket.on('disconnect', () => {
      console.log('❌ Terminal disconnected');
      setIsConnected(false);
    });

    // Handle terminal ready event
    socket.on('terminal-ready', (data: { terminalId: string }) => {
      if (data.terminalId === terminalId) {
        setIsInitialized(true);
        setOutput((prev) => [...prev, 'Terminal ready. Type your commands below.\n']);
      }
    });

    // Handle terminal output from workers
    socket.on('terminal-output', (data: { terminalId: string; output: string }) => {
      if (data.terminalId === terminalId) {
        setOutput((prev) => [...prev, data.output]);
      }
    });

    return () => {
      // Terminate terminal session when component unmounts
      socket.emit('terminal-close', { projectId, terminalId });
      socket.emit('leave-project', { projectId });
      socket.disconnect();
    };
  }, [projectId, terminalId, token, username]);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentCommand.trim() || !socketRef.current) return;

    // Add command to output
    setOutput((prev) => [...prev, `$ ${currentCommand}`]);

    // Add to history
    setCommandHistory((prev) => [...prev, currentCommand]);
    setHistoryIndex(-1);

    // Send command to server
    socketRef.current.emit('terminal-command', {
      projectId,
      terminalId,
      command: currentCommand,
    });

    // Clear input
    setCurrentCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle up/down arrow keys for command history
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 
          ? commandHistory.length - 1 
          : Math.max(0, historyIndex - 1);
        
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCurrentCommand('');
        } else {
          setHistoryIndex(newIndex);
          setCurrentCommand(commandHistory[newIndex]);
        }
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      // Ctrl+C - Send interrupt signal
      e.preventDefault();
      setOutput((prev) => [...prev, '^C']);
      setCurrentCommand('');
    } else if (e.key === 'l' && e.ctrlKey) {
      // Ctrl+L - Clear terminal
      e.preventDefault();
      setOutput([]);
    }
  };

  const handleClear = () => {
    setOutput([]);
  };

  const handleClose = () => {
    if (socketRef.current) {
      socketRef.current.emit('terminal-close', { projectId, terminalId });
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 font-mono">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" onClick={handleClose} style={{ cursor: 'pointer' }} title="Close terminal" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" onClick={handleClear} style={{ cursor: 'pointer' }} title="Clear terminal" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-sm text-gray-400">Terminal - {projectId}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-gray-500">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Terminal Output */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-1"
        style={{ fontFamily: 'Consolas, Monaco, "Courier New", monospace' }}
      >
        {output.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap break-words">
            {line}
          </div>
        ))}
      </div>

      {/* Terminal Input */}
      <form onSubmit={handleCommandSubmit} className="px-4 py-2 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-green-400">$</span>
          <input
            ref={inputRef}
            type="text"
            value={currentCommand}
            onChange={(e) => setCurrentCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none text-gray-100"
            placeholder="Enter command..."
            autoFocus
            disabled={!isConnected}
          />
        </div>
      </form>

      {/* Keyboard Shortcuts Help */}
      <div className="px-4 py-1 bg-gray-950 text-xs text-gray-600 border-t border-gray-800">
        <span>Ctrl+L: Clear</span>
        <span className="mx-2">|</span>
        <span>Ctrl+C: Interrupt</span>
        <span className="mx-2">|</span>
        <span>↑/↓: History</span>
      </div>
    </div>
  );
};
