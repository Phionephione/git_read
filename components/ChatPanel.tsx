import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isStreaming: boolean;
  currentFileName?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, isStreaming, currentFileName }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800">
      <div className="p-4 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2 text-blue-400 mb-1">
          <Sparkles size={18} />
          <h2 className="font-semibold">AI Assistant</h2>
        </div>
        <p className="text-xs text-gray-500">
          Powered by Gemini 2.5 Flash. 
          {currentFileName ? ` Analyzing: ${currentFileName}` : ' Ask about the repo.'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-gray-600 mt-10 text-sm">
            <p className="mb-2">Ask me anything about the code.</p>
            <p>"Explain this file"</p>
            <p>"Find bugs in this function"</p>
            <p>"Generate a unit test"</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center shrink-0
              ${msg.role === 'user' ? 'bg-blue-600' : 'bg-emerald-600'}
            `}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={`
              max-w-[85%] rounded-lg px-4 py-2 text-sm leading-relaxed
              ${msg.role === 'user' 
                ? 'bg-blue-600/20 text-blue-100 border border-blue-600/30' 
                : 'bg-gray-800 text-gray-200 border border-gray-700'}
            `}>
               <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
               </div>
            </div>
          </div>
        ))}
        {isStreaming && (
             <div className="flex gap-3">
                 <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 animate-pulse">
                     <Bot size={16} />
                 </div>
                 <div className="text-gray-500 text-sm flex items-center">Thinking...</div>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-gray-900 border-t border-gray-800">
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="How can I improve this app?"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg pl-4 pr-10 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-gray-500 text-sm"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-400 disabled:opacity-50 disabled:hover:text-gray-400 p-1"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;
