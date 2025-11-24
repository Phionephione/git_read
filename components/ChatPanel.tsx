import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { Send, Bot, User, Sparkles, Paperclip, X, Image as ImageIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, image?: string) => void;
  isStreaming: boolean;
  currentFileName?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSendMessage, isStreaming, currentFileName }) => {
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || isStreaming) return;
    
    onSendMessage(input, selectedImage || undefined);
    setInput('');
    setSelectedImage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    // Reset value so same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
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
          {currentFileName ? (
             <span title="The AI has access to all files, with focus on the current one.">
                Analyzing Repo (Context: <span className="text-gray-400">{currentFileName}</span>)
             </span>
          ) : ' Analyzing Repository'}
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
              max-w-[85%] rounded-lg px-4 py-2 text-sm leading-relaxed overflow-hidden
              ${msg.role === 'user' 
                ? 'bg-blue-600/20 text-blue-100 border border-blue-600/30' 
                : 'bg-gray-800 text-gray-200 border border-gray-700'}
            `}>
               {msg.image && (
                 <div className="mb-2">
                   <img src={msg.image} alt="User upload" className="max-w-full h-auto rounded-md max-h-48 border border-gray-700/50" />
                 </div>
               )}
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
          {selectedImage && (
            <div className="absolute bottom-full left-0 mb-2 p-2 bg-gray-800 rounded-lg border border-gray-700 shadow-lg flex items-center gap-2">
              <img src={selectedImage} alt="Preview" className="w-12 h-12 object-cover rounded bg-gray-900" />
              <button 
                type="button"
                onClick={() => setSelectedImage(null)}
                className="p-1 hover:bg-gray-700 rounded-full text-gray-400 hover:text-red-400"
              >
                <X size={14} />
              </button>
            </div>
          )}
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
          
          <div className="flex items-center gap-2 w-full bg-gray-800 border border-gray-700 rounded-lg pr-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
              title="Upload image"
            >
              <Paperclip size={18} />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={selectedImage ? "Describe the image..." : "How can I improve this app?"}
              className="flex-1 bg-transparent border-none text-gray-100 py-3 focus:outline-none placeholder-gray-500 text-sm"
              disabled={isStreaming}
            />
            <button
              type="submit"
              disabled={(!input.trim() && !selectedImage) || isStreaming}
              className="text-gray-400 hover:text-blue-400 disabled:opacity-50 disabled:hover:text-gray-400 p-2"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;