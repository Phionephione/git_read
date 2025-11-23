import React, { useState, useCallback } from 'react';
import { Search, Github, AlertCircle, Layout, MessageSquare, Menu, X, Play, Code2, ExternalLink } from 'lucide-react';
import { parseRepoUrl, fetchRepoDetails, fetchRepoTree, fetchFileContent } from './services/github';
import { createChatStream } from './services/ai';
import { RepoDetails, FileNode, FileContent, ChatMessage } from './types';
import FileTree from './components/FileTree';
import CodeViewer from './components/CodeViewer';
import ChatPanel from './components/ChatPanel';

function App() {
  // State
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoDetails, setRepoDetails] = useState<RepoDetails | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');
  
  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Mobile/Layout State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const loadRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl) return;

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      setError('Invalid GitHub URL. Format: https://github.com/owner/repo');
      return;
    }

    setLoading(true);
    setError(null);
    setRepoDetails(null);
    setFileTree([]);
    setSelectedFile(null);
    setMessages([]); // Reset chat for new repo
    setViewMode('code'); // Reset view mode

    try {
      const details = await fetchRepoDetails(parsed.owner, parsed.repo);
      setRepoDetails(details);
      
      const tree = await fetchRepoTree(parsed.owner, parsed.repo, details.defaultBranch);
      setFileTree(tree);
      
      // Try to load README if exists
      const readmeNode = tree.find(n => n.name.toLowerCase() === 'readme.md');
      if (readmeNode) {
        handleFileSelect(readmeNode);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load repository');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (node: FileNode) => {
    setSelectedFile({ path: node.path, content: '', loading: true });
    
    // Switch back to code view if file is selected
    setViewMode('code');

    // Mobile: close sidebar on select
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }

    try {
      const content = await fetchFileContent(node.url);
      setSelectedFile({
        path: node.path,
        content,
        loading: false
      });
    } catch (err) {
      setSelectedFile({
        path: node.path,
        content: '',
        loading: false,
        error: 'Failed to load file content'
      });
    }
  };

  const handleSendMessage = useCallback(async (text: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, newMessage]);
    setIsStreaming(true);

    try {
      // Prepare context: currently open file
      const context = selectedFile && !selectedFile.loading && !selectedFile.error 
        ? { path: selectedFile.path, content: selectedFile.content }
        : undefined;

      const stream = await createChatStream([...messages, newMessage], context);
      
      const botMessageId = (Date.now() + 1).toString();
      let fullResponse = '';
      
      // Add initial empty bot message
      setMessages(prev => [...prev, {
        id: botMessageId,
        role: 'model',
        text: '',
        timestamp: Date.now(),
        isStreaming: true
      }]);

      for await (const chunk of stream) {
        fullResponse += chunk;
        setMessages(prev => prev.map(msg => 
          msg.id === botMessageId 
            ? { ...msg, text: fullResponse }
            : msg
        ));
      }
      
      // Finalize
      setMessages(prev => prev.map(msg => 
        msg.id === botMessageId 
          ? { ...msg, isStreaming: false }
          : msg
      ));

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "Sorry, I encountered an error communicating with Gemini.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsStreaming(false);
    }
  }, [messages, selectedFile]);

  // Helper to determine the best preview URL
  const getAppPreviewUrl = () => {
    if (!repoDetails) return '';
    
    // 1. Use Homepage if available and valid
    if (repoDetails.homepage && (repoDetails.homepage.startsWith('http://') || repoDetails.homepage.startsWith('https://'))) {
      return repoDetails.homepage;
    }
    
    // 2. Fallback to StackBlitz
    return `https://stackblitz.com/github/${repoDetails.owner}/${repoDetails.name}?embed=1&view=preview&hideExplorer=1&hidedevtools=1`;
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="h-16 border-b border-gray-800 bg-gray-950 flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Github className="text-white" />
          <span className="font-bold text-xl hidden sm:inline">GitGenius</span>
        </div>

        <form onSubmit={loadRepo} className="flex-1 max-w-xl mx-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input 
              type="text" 
              placeholder="https://github.com/username/repository"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
            />
          </div>
        </form>

        <div className="flex items-center gap-4">
          {/* View Toggle */}
          {repoDetails && (
            <div className="hidden md:flex bg-gray-900 rounded-lg p-1 border border-gray-700">
              <button
                onClick={() => setViewMode('code')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${viewMode === 'code' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
              >
                <Code2 size={16} />
                Code
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${viewMode === 'preview' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
              >
                <Play size={16} />
                Live App
              </button>
            </div>
          )}

           <button 
             onClick={() => setIsChatOpen(!isChatOpen)}
             className={`p-2 rounded-lg hover:bg-gray-800 transition-colors ${isChatOpen ? 'text-blue-400 bg-gray-800' : 'text-gray-400'}`}
             title="Toggle AI Chat"
           >
             <MessageSquare size={20} />
           </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Error State */}
        {error && (
          <div className="absolute inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-gray-900 border border-red-900/50 p-6 rounded-xl shadow-2xl max-w-md w-full">
              <div className="flex items-center gap-3 text-red-400 mb-2">
                <AlertCircle />
                <h3 className="font-bold text-lg">Error</h3>
              </div>
              <p className="text-gray-300 mb-4">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="w-full bg-gray-800 hover:bg-gray-700 py-2 rounded-lg transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Sidebar (File Tree) - Hidden in Live App mode on mobile, or based on toggle */}
        {viewMode === 'code' && (
          <div className={`
            absolute md:relative z-20 md:z-auto h-full w-64 bg-gray-925 border-r border-gray-800 flex flex-col transition-transform duration-300
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            bg-[#0f141a]
          `}>
             <div className="p-4 border-b border-gray-800 flex justify-between items-center">
               <span className="font-semibold text-gray-400 text-sm">Explorer</span>
               <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 hover:bg-gray-800 rounded">
                 <X size={16} />
               </button>
             </div>
             
             <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
               {loading ? (
                 <div className="space-y-3 p-2 animate-pulse">
                   {[1,2,3,4].map(i => <div key={i} className="h-4 bg-gray-800 rounded w-3/4"></div>)}
                 </div>
               ) : fileTree.length > 0 ? (
                 <FileTree 
                    nodes={fileTree} 
                    onSelectFile={handleFileSelect} 
                    selectedPath={selectedFile?.path}
                 />
               ) : (
                 <div className="text-center text-gray-500 mt-10 text-sm p-4">
                   Enter a valid GitHub URL to load files.
                 </div>
               )}
             </div>
          </div>
        )}

        {/* Toggle Sidebar Button (Mobile) */}
        {!isSidebarOpen && viewMode === 'code' && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute left-2 top-2 z-30 p-2 bg-gray-800 rounded-lg shadow-lg md:hidden"
          >
            <Menu size={20} />
          </button>
        )}

        {/* View Content Area */}
        <div className="flex-1 overflow-hidden bg-gray-900 relative flex flex-col">
           {viewMode === 'code' ? (
             <>
                {repoDetails && !selectedFile && !loading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 p-8 text-center opacity-50 pointer-events-none">
                    <Github size={64} className="mb-4" />
                    <h2 className="text-2xl font-bold mb-2">{repoDetails.name}</h2>
                    <p>{repoDetails.description}</p>
                  </div>
                )}
                <CodeViewer file={selectedFile} repoDetails={repoDetails} />
             </>
           ) : (
             <div className="w-full h-full bg-gray-950 flex flex-col">
               {repoDetails ? (
                 <div className="flex-1 relative bg-white">
                   <div className="absolute top-0 left-0 right-0 bg-gray-800 text-xs text-gray-400 p-2 flex justify-between items-center border-b border-gray-700 z-10">
                      <span>Preview Source: {getAppPreviewUrl().includes('stackblitz') ? 'StackBlitz Container' : 'Official Deployment'}</span>
                      <a href={getAppPreviewUrl().replace('&embed=1', '').replace('embed=1', '')} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-white">
                        Open External <ExternalLink size={12} />
                      </a>
                   </div>
                   <iframe 
                      src={getAppPreviewUrl()}
                      title="App Preview"
                      className="w-full h-full pt-8"
                      allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
                      sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                   />
                 </div>
               ) : (
                 <div className="flex items-center justify-center h-full text-gray-500">
                    Load a repository to see the live app.
                 </div>
               )}
             </div>
           )}
        </div>

        {/* AI Chat Panel */}
        {isChatOpen && (
          <div className="w-96 border-l border-gray-800 bg-gray-900 flex flex-col shrink-0 absolute right-0 h-full z-30 shadow-xl sm:static sm:shadow-none transition-all">
             <ChatPanel 
               messages={messages}
               onSendMessage={handleSendMessage}
               isStreaming={isStreaming}
               currentFileName={viewMode === 'code' ? selectedFile?.path : 'Live App Mode'}
             />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;