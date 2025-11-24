import React, { useState, useCallback } from 'react';
import { Search, Github, AlertCircle, Layout, MessageSquare, Menu, X, Play, Code2, ExternalLink, Zap, Box, Globe } from 'lucide-react';
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
  const [previewRunner, setPreviewRunner] = useState<'official' | 'stackblitz' | 'codesandbox'>('stackblitz');
  
  // File Modification State (Map of path -> content)
  const [modifiedFiles, setModifiedFiles] = useState<Record<string, string>>({});
  
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
    setModifiedFiles({}); // Reset modifications

    try {
      const details = await fetchRepoDetails(parsed.owner, parsed.repo);
      setRepoDetails(details);
      
      // Smart default for runner
      if (details.homepage && (details.homepage.startsWith('http'))) {
          setPreviewRunner('official');
      } else {
          setPreviewRunner('stackblitz');
      }

      const tree = await fetchRepoTree(parsed.owner, parsed.repo, details.defaultBranch);
      setFileTree(tree);

      // Try to find README
      const readmeNode = tree.find(n => n.name.toLowerCase() === 'readme.md');
      if (readmeNode) {
        handleSelectFile(readmeNode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repository');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFile = async (node: FileNode) => {
    if (node.type === 'tree') return;

    // Reset view to code when selecting a file (unless we are already in live app mode)
    if (viewMode === 'preview' && previewRunner !== 'official') {
       setViewMode('code');
    }

    setSelectedFile(prev => ({ 
      path: node.path, 
      content: prev?.path === node.path ? prev.content : '', 
      loading: true 
    }));

    try {
      const content = await fetchFileContent(node.url);
      setSelectedFile({ path: node.path, content, loading: false });
    } catch (err) {
      setSelectedFile({ 
        path: node.path, 
        content: '', 
        loading: false, 
        error: 'Failed to load file content' 
      });
    }
  };

  const updateFileContent = (path: string, newContent: string) => {
    setModifiedFiles(prev => ({
        ...prev,
        [path]: newContent
    }));
  };

  const discardFileChanges = (path: string) => {
      setModifiedFiles(prev => {
          const next = { ...prev };
          delete next[path];
          return next;
      });
  };

  const handleSendMessage = async (text: string, image?: string) => {
    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: Date.now(),
      image
    };

    setMessages(prev => [...prev, newUserMsg]);
    setIsStreaming(true);

    try {
      // Pass the currently selected file content (including modifications) as context
      const currentContent = selectedFile 
          ? (modifiedFiles[selectedFile.path] || selectedFile.content) 
          : '';

      const context = selectedFile && !selectedFile.loading && !selectedFile.error 
        ? { path: selectedFile.path, content: currentContent }
        : undefined;

      const onToolCall = (toolCall: any) => {
          if (toolCall.name === 'update_file') {
              const { code, description } = toolCall.args;
              if (selectedFile) {
                  updateFileContent(selectedFile.path, code);
                  // If it's an HTML file, auto-switch to preview to see changes
                  if (selectedFile.path.endsWith('.html')) {
                      setViewMode('code'); // CodeViewer handles the tab state internally for preview
                  }
              }
          }
      };

      const stream = await createChatStream([...messages, newUserMsg], context, onToolCall);
      
      let botMsgId = (Date.now() + 1).toString();
      let fullResponse = '';

      setMessages(prev => [...prev, {
        id: botMsgId,
        role: 'model',
        text: '',
        timestamp: Date.now(),
        isStreaming: true
      }]);

      for await (const chunk of stream) {
        fullResponse += chunk;
        setMessages(prev => prev.map(msg => 
          msg.id === botMsgId ? { ...msg, text: fullResponse } : msg
        ));
      }

      setMessages(prev => prev.map(msg => 
        msg.id === botMsgId ? { ...msg, isStreaming: false } : msg
      ));
      
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: 'Sorry, I encountered an error analyzing the code. Please try again.',
        timestamp: Date.now()
      }]);
    } finally {
      setIsStreaming(false);
    }
  };

  const getLivePreviewUrl = () => {
     if (!repoDetails) return '';
     
     if (previewRunner === 'official') {
         return repoDetails.homepage || '';
     }
     if (previewRunner === 'stackblitz') {
         return `https://stackblitz.com/github/${repoDetails.owner}/${repoDetails.name}?embed=1&view=preview&hideExplorer=1&hidedevtools=1`;
     }
     if (previewRunner === 'codesandbox') {
         return `https://codesandbox.io/embed/github/${repoDetails.owner}/${repoDetails.name}?fontsize=14&hidenavigation=1&theme=dark&view=preview`;
     }
     return '';
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="h-16 border-b border-gray-800 flex items-center px-4 gap-4 bg-gray-950 shrink-0 relative z-20">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <Github className="text-white" />
          <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">GitGenius</span>
        </div>

        <form onSubmit={loadRepo} className="flex-1 max-w-2xl mx-auto relative group">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-blue-400 transition-colors">
            <Search size={18} />
          </div>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="w-full bg-gray-900 border border-gray-700 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-gray-600"
          />
        </form>

        <div className="flex items-center gap-3">
           {/* View Mode Switcher - Only visible when repo is loaded */}
           {repoDetails && (
             <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                <button 
                  onClick={() => setViewMode('code')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'code' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Code2 size={16} /> Code
                </button>
                <button 
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'preview' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Play size={16} /> Live App
                </button>
             </div>
           )}

           <button 
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`p-2 rounded-lg transition-colors relative ${isChatOpen ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'}`}
          >
            <MessageSquare size={20} />
            {!isChatOpen && messages.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></span>
            )}
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar */}
        <div className={`
          ${isSidebarOpen ? 'w-64' : 'w-0'} 
          bg-gray-900 border-r border-gray-800 transition-all duration-300 flex flex-col shrink-0
        `}>
          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Explorer</span>
            <button onClick={() => setIsSidebarOpen(false)} className="text-gray-500 hover:text-gray-300 md:hidden">
              <X size={16} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            {loading ? (
              <div className="text-center py-8 text-gray-500 text-sm animate-pulse">Scanning repository...</div>
            ) : fileTree.length > 0 ? (
              <FileTree 
                nodes={fileTree} 
                onSelectFile={handleSelectFile} 
                selectedPath={selectedFile?.path}
              />
            ) : (
              <div className="text-center py-8 text-gray-600 text-sm">
                Enter a GitHub URL to start
              </div>
            )}
          </div>

          {repoDetails && (
             <div className="p-3 border-t border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-2 text-sm text-gray-300 font-medium truncate">
                   <div className="w-2 h-2 rounded-full bg-green-500 shrink-0"></div>
                   {repoDetails.name}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                   <span>⭐ {repoDetails.stars}</span>
                   <span>{repoDetails.defaultBranch}</span>
                </div>
             </div>
          )}
        </div>

        {/* Toggle Sidebar Button (when closed) */}
        {!isSidebarOpen && (
           <button 
             onClick={() => setIsSidebarOpen(true)}
             className="absolute left-2 top-20 z-10 p-2 bg-gray-800 rounded-md border border-gray-700 text-gray-400 hover:text-white"
           >
             <Menu size={16} />
           </button>
        )}

        {/* Center Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
          {error && (
            <div className="absolute inset-x-0 top-0 z-50 p-4">
              <div className="bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-3 rounded-lg flex items-center gap-2 backdrop-blur-md">
                <AlertCircle size={20} />
                {error}
              </div>
            </div>
          )}

          {viewMode === 'preview' && repoDetails ? (
            <div className="flex-1 flex flex-col bg-gray-900">
                {/* Live App Toolbar */}
                <div className="h-10 border-b border-gray-800 bg-gray-850 flex items-center justify-between px-4">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="font-semibold text-gray-300">Preview Source:</span>
                        {previewRunner === 'stackblitz' && 'StackBlitz Container'}
                        {previewRunner === 'codesandbox' && 'CodeSandbox VM'}
                        {previewRunner === 'official' && 'Official Deployment'}
                    </div>

                    <div className="flex items-center gap-2">
                        {repoDetails.homepage && (
                            <button 
                                onClick={() => setPreviewRunner('official')}
                                className={`p-1.5 rounded transition-colors ${previewRunner === 'official' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                                title="Use Official Homepage"
                            >
                                <Globe size={14} />
                            </button>
                        )}
                         <button 
                            onClick={() => setPreviewRunner('stackblitz')}
                            className={`p-1.5 rounded transition-colors ${previewRunner === 'stackblitz' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                            title="Run in StackBlitz (Best for React/Node)"
                        >
                            <Zap size={14} />
                        </button>
                         <button 
                            onClick={() => setPreviewRunner('codesandbox')}
                            className={`p-1.5 rounded transition-colors ${previewRunner === 'codesandbox' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                            title="Run in CodeSandbox (Alternative)"
                        >
                            <Box size={14} />
                        </button>
                        <div className="w-px h-4 bg-gray-700 mx-1"></div>
                        <a 
                            href={getLivePreviewUrl()} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                        >
                            Open External <ExternalLink size={12} />
                        </a>
                    </div>
                </div>

                {/* Runner Iframe */}
                <div className="flex-1 bg-black relative">
                   {previewRunner === 'stackblitz' && (
                       <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                           <div className="text-center p-6 max-w-md">
                               <Zap size={48} className="mx-auto text-blue-500 mb-4 animate-pulse" />
                               <h3 className="text-lg font-semibold text-gray-200 mb-2">Booting WebContainer...</h3>
                               <p className="text-sm text-gray-500">
                                   If this hangs, ensure 3rd-party cookies are allowed or try switching to CodeSandbox using the icons above.
                               </p>
                           </div>
                       </div>
                   )}
                   <iframe
                        key={previewRunner} // Force re-render on switch
                        src={getLivePreviewUrl()}
                        className="w-full h-full border-none relative z-10"
                        title="Live App Preview"
                        allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
                        sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                    />
                </div>
            </div>
          ) : (
            <CodeViewer 
                file={selectedFile} 
                repoDetails={repoDetails}
                modifiedContent={selectedFile ? (modifiedFiles[selectedFile.path] || null) : null}
                onUpdateContent={(content) => {
                    if (selectedFile) updateFileContent(selectedFile.path, content);
                }}
                onDiscardChanges={() => {
                    if (selectedFile) discardFileChanges(selectedFile.path);
                }}
            />
          )}
        </div>

        {/* Chat Panel */}
        <div className={`
          ${isChatOpen ? 'w-96 border-l border-gray-800' : 'w-0'} 
          bg-gray-900 transition-all duration-300 flex flex-col shrink-0
        `}>
          <div className="flex-1 overflow-hidden">
             {isChatOpen && (
                 <ChatPanel 
                    messages={messages} 
                    onSendMessage={handleSendMessage}
                    isStreaming={isStreaming}
                    currentFileName={selectedFile?.path}
                 />
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;