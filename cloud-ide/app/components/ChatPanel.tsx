'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, RefreshCw, Trash2 } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  fileOperations?: FileOperation[];
}

interface FileOperation {
  action: 'create' | 'edit' | 'delete' | 'read';
  path: string;
  content?: string;
  description: string;
}

interface ChatPanelProps {
  projectId: string;
  token: string;
  onFileOperationComplete?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  projectId,
  token,
  onFileOperationComplete,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadChatHistory();
    inputRef.current?.focus();
  }, [projectId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`/api/v2/projects/${projectId}/chat`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })));
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(`/api/v2/projects/${projectId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: inputMessage,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        const aiMessage: ChatMessage = {
          id: data.messageId || Date.now().toString(),
          role: 'assistant',
          content: data.message,
          timestamp: new Date(),
          fileOperations: data.fileOperations || [],
        };

        setMessages(prev => [...prev, aiMessage]);

        if (data.fileOperations?.length > 0 && onFileOperationComplete) {
          onFileOperationComplete();
        }

        if (!data.success && data.error) {
          console.error('AI operation error:', data.error);
        }
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getFileOperationIcon = (action: string) => {
    switch (action) {
      case 'create': return '📄';
      case 'edit': return '✏️';
      case 'delete': return '🗑️';
      case 'read': return '👁️';
      default: return '📁';
    }
  };

  return (
    <div className="h-full bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-medium">AI Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadChatHistory}
            disabled={isLoadingHistory}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Refresh chat"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Bot className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <p className="text-sm">
              Hi! I'm your AI assistant. I can help you create, edit, and delete files in your project.
            </p>
            <p className="text-xs mt-2 text-gray-500">
              Try: "Create a React component" or "Add a README file"
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user' 
                    ? 'bg-blue-600' 
                    : 'bg-gray-700'
                }`}>
                  {message.role === 'user' ? (
                    <User className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-blue-400" />
                  )}
                </div>
                
                <div className={`rounded-lg p-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-100'
                }`}>
                  <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                  
                  {/* File Operations */}
                  {message.fileOperations && message.fileOperations.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs text-gray-300 font-medium">✅ Completed File Operations:</div>
                      {message.fileOperations.map((op, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 text-xs bg-gray-700 rounded p-2"
                        >
                          <span className="text-lg">{getFileOperationIcon(op.action)}</span>
                          <div className="flex-1">
                            <div className="text-white font-mono">{op.path}</div>
                            <div className="text-gray-400">{op.description}</div>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                            op.action === 'create' ? 'bg-green-600 text-white' :
                            op.action === 'edit' ? 'bg-yellow-600 text-white' :
                            op.action === 'delete' ? 'bg-red-600 text-white' :
                            'bg-blue-600 text-white'
                          }`}>
                            {op.action === 'create' && '✅'}
                            {op.action === 'edit' && '✏️'}
                            {op.action === 'delete' && '🗑️'}
                            {op.action === 'read' && '👁️'}
                            {op.action}
                          </span>
                        </div>
                      ))}
                      <div className="text-xs text-green-400 mt-2">
                        💡 Files are automatically created! Check the file explorer on the left.
                      </div>
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-400 mt-2">
                    {formatTimestamp(message.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-blue-400" />
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-400">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-xs">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me to create, edit, or delete files..."
            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg px-3 py-2 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};