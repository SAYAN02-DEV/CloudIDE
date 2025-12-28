'use client';

import React, { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';
import { MonacoBinding } from '@/lib/editor/MonacoBinding';
import * as monaco from 'monaco-editor';

interface CollaborativeEditorProps {
  projectId: string;
  filePath: string;
  userId: string;
  username: string;
  token: string;
  initialContent?: string;
  language?: string;
  theme?: 'vs-dark' | 'light';
  onSave?: (content: string) => void;
}

interface CursorPosition {
  userId: string;
  username: string;
  position: { line: number; column: number };
  color: string;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  projectId,
  filePath,
  userId,
  username,
  token,
  initialContent = '',
  language = 'typescript',
  theme = 'vs-dark',
  onSave,
}) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const tokenRef = useRef<string>(token);
  const initialStateAppliedRef = useRef<boolean>(false);
  const [isConnected, setIsConnected] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState<CursorPosition[]>([]);
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [pendingState, setPendingState] = useState<Uint8Array | null>(null);
  // No need to fetch from S3 - CRDT state comes from WebSocket

  // Update token ref when it changes
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Initialize WebSocket connection and Yjs
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
    
    console.log('🔌 Connecting to WebSocket at:', wsUrl);
    console.log('🔑 Using token:', token ? 'present' : 'missing');
    
    // Create socket connection
    const socket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to WebSocket server');
      console.log('📡 Socket ID:', socket.id);
      setIsConnected(true);

      // Join project room
      console.log('🏠 Joining project:', projectId);
      socket.emit('join-project', { projectId });

      // Open file for collaboration
      console.log('📄 Opening file:', filePath);
      socket.emit('open-file', { projectId, filePath });
    });

    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error.message);
      setIsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from WebSocket server. Reason:', reason);
      setIsConnected(false);
    });

    // Handle file opened event
    socket.on('file-opened', (data: { projectId: string; filePath: string; state: string }) => {
      console.log('📥 Received file-opened event for:', data.filePath);
      
      // Ignore if this is for a different file
      if (data.filePath !== filePath) {
        console.log('⏭️  Ignoring file-opened for different file:', data.filePath);
        return;
      }
      
      // Prevent applying the same initial state multiple times
      if (initialStateAppliedRef.current) {
        console.log('⏭️  Initial state already applied, ignoring duplicate');
        return;
      }
      
      const state = Buffer.from(data.state, 'base64');
      console.log('📝 Received initial state, size:', state.length);
      
      // Only store/apply if there's meaningful content
      if (state.length <= 2) {
        console.log('⚠️  Server state is empty, will use initialContent from S3 instead');
        initialStateAppliedRef.current = true;
        return;
      }
      
      if (!ydocRef.current) {
        console.warn('⚠️  Ydoc not ready, storing state');
        setPendingState(state);
        return;
      }

      if (!editorRef.current) {
        console.warn('⚠️  Editor not ready, storing state');
        setPendingState(state);
        return;
      }

      // Apply initial document state
      console.log('✅ Applying initial state immediately');
      Y.applyUpdate(ydocRef.current, state, 'remote');
      initialStateAppliedRef.current = true;
    });

    // Handle document updates from other users
    socket.on('document-update', (data: { projectId: string; filePath: string; update: string }) => {
      console.log('📥 Received document-update for:', data.filePath);
      
      // Ignore updates for different files
      if (data.filePath !== filePath) {
        console.log('⏭️  Ignoring update for different file:', data.filePath);
        return;
      }
      
      if (!ydocRef.current) {
        console.warn('⚠️  Ydoc not ready for update');
        return;
      }
      
      try {
        const update = Buffer.from(data.update, 'base64');
        console.log('🔄 Applying remote update, size:', update.length);
        Y.applyUpdate(ydocRef.current, update, 'remote');
      } catch (error) {
        console.error('❌ Error applying remote update:', error);
      }
    });

    // Handle user presence
    socket.on('user-joined', (data: { userId: string; username: string; socketId: string }) => {
      console.log(`👤 ${data.username} joined the project`);
      setCollaborators((prev) => [...prev, data.username]);
    });

    socket.on('user-left', (data: { userId: string; username: string; socketId: string }) => {
      console.log(`👤 ${data.username} left the project`);
      setCollaborators((prev) => prev.filter((name) => name !== data.username));
      setRemoteCursors((prev) => prev.filter((cursor) => cursor.userId !== data.userId));
    });

    // Handle cursor updates
    socket.on('cursor-update', (data: CursorPosition & { projectId: string; filePath: string }) => {
      setRemoteCursors((prev) => {
        const filtered = prev.filter((c) => c.userId !== data.userId);
        return [...filtered, {
          userId: data.userId,
          username: data.username,
          position: data.position,
          color: getUserColor(data.userId),
        }];
      });
    });

    return () => {
      console.log('🧹 Cleaning up WebSocket connection');
      socket.emit('leave-project', { projectId });
      socket.disconnect();
      
      // Clear editor ref when unmounting/switching files
      editorRef.current = null;
    };
  }, [projectId, filePath, token]);

  // Initialize Yjs document FIRST, before WebSocket
  useEffect(() => {
    console.log('🔧 Initializing Yjs document for:', filePath);
    
    // Reset the initial state flag when switching files
    initialStateAppliedRef.current = false;
    
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Set up Yjs update handler
    ydoc.on('update', (update: Uint8Array, origin: any) => {
      console.log('📤 Yjs update triggered, origin:', origin, 'size:', update.length);
      if (origin !== 'remote' && socketRef.current) {
        // Send update to server (server will handle auto-save to S3)
        const updateBase64 = Buffer.from(update).toString('base64');
        console.log('📡 Sending update to server (server will auto-save to S3)');
        socketRef.current.emit('edit-document', {
          projectId,
          filePath,
          update: updateBase64,
        });
      } else {
        console.log('⏭️  Skipping update (origin: remote or no socket)');
      }
    });

    return () => {
      console.log('🧹 Destroying Yjs document for:', filePath);
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      ydoc.destroy();
    };
  }, [projectId, filePath]);

  // Handle editor mount
  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => {
    console.log('🎨 Monaco editor mounted');
    editorRef.current = editor;

    if (!ydocRef.current) {
      console.error('❌ Yjs document not ready when editor mounted!');
      return;
    }

    // Get or create text type
    const ytext = ydocRef.current.getText('monaco');
    console.log('📝 Creating Monaco binding, current text length:', ytext.toString().length);

    // CRITICAL: Destroy old binding before creating new one
    if (bindingRef.current) {
      console.log('🧹 Destroying old Monaco binding');
      bindingRef.current.destroy();
      bindingRef.current = null;
    }

    // CRITICAL: Clear the editor model before binding
    const model = editor.getModel();
    if (model && model.getValue() !== '') {
      console.log('🧹 Clearing old editor content');
      model.setValue('');
    }

    // Create Monaco binding
    const binding = new MonacoBinding(
      ytext,
      editor.getModel()!,
      new Set([editor]),
      null as any
    );

    bindingRef.current = binding;
    console.log('✅ Monaco binding created');

    // Apply pending CRDT state if we received it before editor was ready
    if (pendingState && pendingState.length > 2 && !initialStateAppliedRef.current) {
      // Only apply if there's actual content AND we haven't applied state yet
      console.log('📦 Applying pending CRDT state from server, size:', pendingState.length);
      Y.applyUpdate(ydocRef.current, pendingState, 'remote');
      initialStateAppliedRef.current = true;
      setPendingState(null);
    } else {
      console.log('📭 No pending state or already applied, file will be empty or already loaded');
    }

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      if (socketRef.current) {
        socketRef.current.emit('cursor-update', {
          projectId,
          filePath,
          position: {
            line: e.position.lineNumber,
            column: e.position.column,
          },
        });
      }
    });

    // Handle save shortcut (Ctrl+S / Cmd+S)
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      if (onSave) {
        const content = editor.getValue();
        onSave(content);
      }
    });

    // Render remote cursors
    renderRemoteCursors(editor, monacoInstance);
  };

  // Render remote cursors in the editor
  const renderRemoteCursors = (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => {
    const decorations: string[] = [];

    remoteCursors.forEach((cursor) => {
      const decoration = editor.deltaDecorations(
        [],
        [
          {
            range: new monacoInstance.Range(
              cursor.position.line,
              cursor.position.column,
              cursor.position.line,
              cursor.position.column
            ),
            options: {
              className: 'remote-cursor',
              glyphMarginClassName: 'remote-cursor-glyph',
              hoverMessage: { value: cursor.username },
              stickiness: monacoInstance.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
              beforeContentClassName: 'remote-cursor-line',
            },
          },
        ]
      );

      decorations.push(...decoration);
    });
  };

  useEffect(() => {
    if (editorRef.current) {
      renderRemoteCursors(editorRef.current, monaco);
    }
  }, [remoteCursors]);

  const getUserColor = (userId: string): string => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    ];
    
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="relative w-full h-full">
      {/* Connection Status */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span className="text-xs text-gray-500">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Collaborators List */}
      {collaborators.length > 0 && (
        <div className="absolute top-2 left-2 z-10 bg-gray-800 text-white px-3 py-1 rounded text-xs">
          👥 {collaborators.length} collaborator{collaborators.length > 1 ? 's' : ''}
        </div>
      )}

      {/* Monaco Editor */}
      <Editor
        key={`${projectId}-${filePath}`}
        height="100%"
        language={language}
        theme={theme}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: true },
          fontSize: 14,
          lineNumbers: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          readOnly: false,
        }}
      />

      {/* Custom styles for remote cursors */}
      <style jsx global>{`
        .remote-cursor {
          background-color: rgba(255, 107, 107, 0.3);
          border-left: 2px solid #ff6b6b;
        }
        
        .remote-cursor-line::before {
          content: '';
          position: absolute;
          width: 2px;
          height: 20px;
          background-color: #ff6b6b;
        }
      `}</style>
    </div>
  );
}
