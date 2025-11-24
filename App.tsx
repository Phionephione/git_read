import React, { useState, useCallback } from 'react';
import { Search, Github, AlertCircle, Layout, MessageSquare, Menu, X, Play, Code2, ExternalLink, Zap, Box, Globe, Sparkles } from 'lucide-react';
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
  
  // File Content Cache & Modifications
  const [filesCache, setFilesCache] = useState<Record<string, string>>({});
  const [modifiedFiles, setModifiedFiles] = useState<Record<string, string>>({});
  
  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Live App AI Edit
  const [showLiveAppEdit, setShowLiveAppEdit] = useState(false);
  const [liveAppEditPrompt, setLiveAppEditPrompt] = useState('');

  // Mobile/Layout State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Helper to get all file paths for AI context
  const getAllFilePaths = (nodes: FileNode[]): string[] => {
    let paths: string[] = [];
    nodes.forEach(node => {
      if (node.type === 'blob') paths.push(node.path);
      if (node.children) paths.push(...getAllFilePaths(node.children));
    });
    return paths;
  };

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
    setFilesCache({}); // Reset cache

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

    // Check cache first
    if (filesCache[node.path]) {
        setSelectedFile({ path: node.path, content: filesCache[node.path], loading: false });
        return;
    }

    // If it's a new local file not in cache yet (edge case), content is empty string initially if not in modifiedFiles
    // But typically insertFileIntoTree+updateFileContent handles this.
    
    // For GitHub files
    if (node.url) {
      setSelectedFile(prev => ({ 
        path: node.path, 
        content: prev?.path === node.path ? prev.content : '', 
        loading: true 
      }));

      try {
        const content = await fetchFileContent(node.url);
        setFilesCache(prev => ({ ...prev, [node.path]: content }));
        setSelectedFile({ path: node.path, content, loading: false });
      } catch (err) {
        setSelectedFile({ 
          path: node.path, 
          content: '', 
          loading: false, 
          error: 'Failed to load file content' 
        });
      }
    } else {
        // Local new file
        setSelectedFile({ path: node.path, content: modifiedFiles[node.path] || '', loading: false });
    }
  };

  const updateFileContent = (path: string, newContent: string) => {
    setModifiedFiles(prev => ({
        ...prev,
        [path]: newContent
    }));
    // Also update cache so subsequent reads get new content
    setFilesCache(prev => ({
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
      // We don't revert cache here easily without re-fetching, 
      // strictly speaking we should re-fetch or store original in cache differently.
      // For now, if discarded, user might need to reload file to see original in cache if they re-open it.
      // But typically discard just affects UI view.
  };

  const handleFetchFileForAI = async (path: string): Promise<string> => {
      // 1. Check if modified
      if (modifiedFiles[path]) return modifiedFiles[path];
      // 2. Check cache
      if (filesCache[path]) return filesCache[path];

      // 3. Fetch from GitHub
      // We need the URL. The fileTree has the URL.
      // Helper to find node
      const findNode = (nodes: FileNode[], targetPath: string): FileNode | null => {
          for (const node of nodes) {
              if (node.path === targetPath) return node;
              if (node.children) {
                  const found = findNode(node.children, targetPath);
                  if (found) return found;
              }
          }
          return null;
      };

      const node = findNode(fileTree, path);
      if (!node) {
          // It might be a new file that was just created but not yet in tree? 
          // Or AI hallucinates.
          throw new Error(`File ${path} not found in repository.`);
      }

      if (!node.url) return ""; // Local file without content?

      const content = await fetchFileContent(node.url);
      
      // Update cache
      setFilesCache(prev => ({ ...prev, [path]: content }));
      return content;
  };

  const insertFileIntoTree = useCallback((nodes: FileNode[], filePath: string): FileNode[] => {
      const parts = filePath.split('/');
      const fileName = parts.pop()!;
      
      const insertRecursive = (currentNodes: FileNode[], currentDepth: number): FileNode[] => {
          // Check if we are at the target folder depth
          if (currentDepth === parts.length) {
              // Check if file already exists
              const existingIndex = currentNodes.findIndex(n => n.name === fileName);
              if (existingIndex !== -1) {
                  return currentNodes; // Already exists
              }
              
              // Create new file node
              const newNode: FileNode = {
                  path: filePath,
                  name: fileName,
                  type: 'blob',
                  // sha/url are optional now
              };
              
              return [...currentNodes, newNode].sort((a, b) => {
                  if (a.type === b.type) return a.name.localeCompare(b.name);
                  return a.type === 'tree' ? -1 : 1;
              });
          }
          
          const folderName = parts[currentDepth];
          const folderIndex = currentNodes.findIndex(n => n.name === folderName && n.type === 'tree');
          
          let updatedNodes = [...currentNodes];
          
          if (folderIndex !== -1) {
              // Folder exists, update its children
              const folder = updatedNodes[folderIndex];
              const updatedChildren = insertRecursive(folder.children || [], currentDepth + 1);
              updatedNodes[folderIndex] = { ...folder, children: updatedChildren };
          } else {
              // Folder doesn't exist, create it
              const folderPath = parts.slice(0, currentDepth + 1).join('/');
              let newFolder: FileNode = {
                  path: folderPath,
                  name: folderName,
                  type: 'tree',
                  children: []
              };
              newFolder.children = insertRecursive([], currentDepth + 1);
              updatedNodes.push(newFolder);
              updatedNodes.sort((a, b) => {
                  if (a.type === b.type) return a.name.localeCompare(b.name);
                  return a.type === 'tree' ? -1 : 1;
              });
          }
          
          return updatedNodes;
      };

      return insertRecursive(nodes, 0);
  }, []);

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
      // Pass the currently selected file context if available
      const currentContent = selectedFile 
          ? (modifiedFiles[selectedFile.path] || selectedFile.content) 
          : '';

      const context = selectedFile && !selectedFile.loading && !selectedFile.error 
        ? { path: selectedFile.path, content: currentContent }
        : undefined;

      // Get full file structure
      const allPaths = getAllFilePaths(fileTree);

      const onToolCall = (toolCall: any) => {
          if (toolCall.name === 'update_file') {
              const { code, description, path } = toolCall.args;
              
              // Target path: prefer explicit arg, fallback to active file
              const targetPath = path || selectedFile?.path;

              if (targetPath) {
                  updateFileContent(targetPath, code);
                  
                  // NEW: Update tree to show new file if it was created
                  setFileTree(prev => insertFileIntoTree(prev, targetPath));
                  
                  // If we updated the currently viewing file, ensure UI reflects it
                  if (selectedFile && targetPath === selectedFile.path) {
                     // Force refresh if needed, state update handled by modifiedFiles effect in CodeViewer
                     if (targetPath.endsWith('.html')) {
                        setViewMode('code'); 
                     }
                  }
              }
          }
      };

      // Create stream with agentic capabilities
      const stream = await createChatStream(
          [...messages, newUserMsg], 
          allPaths,
          context, 
          onToolCall,
          handleFetchFileForAI
      );
      
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

  const handleTriggerAiEdit = (prompt: string, image?: string) => {
    // 1. Open Chat
    setIsChatOpen(true);
    
    // 2. Format Prompt
    // If we are editing a specific file via CodeViewer
    const contextPrefix = selectedFile 
        ? `[TASK: Edit '${selectedFile.path}'] `
        : `[TASK: Edit Repository] `;
    
    const fullPrompt = `${contextPrefix}${prompt}\n\nPlease update the code using the 'update_file' tool. Check other files with 'read_file' if you need context about imports or styles.`;

    // 3. Send Message
    handleSendMessage(fullPrompt, image);
  };

  const handleGlobalAppEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveAppEditPrompt.trim()) return;
    
    setIsChatOpen(true);
    const fullPrompt = `[TASK: Global App Edit] ${liveAppEditPrompt}\n\nFind the relevant file (search for it or read file structure) and update it using 'update_file'.`;
    handleSendMessage(fullPrompt);
    setShowLiveAppEdit(false);
    setLiveAppEditPrompt('');
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
                         {/* Global AI Edit Button */}
                         <div className="relative">
                            <button
                                onClick={() => setShowLiveAppEdit(!showLiveAppEdit)}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors border ${showLiveAppEdit ? 'bg-purple-900/50 text-purple-200 border-purple-500' : 'bg-gray-800 text-purple-400 border-gray-600 hover:border-purple-500'}`}
                            >
                                <Sparkles size={12} /> Edit App
                            </button>
                            {showLiveAppEdit && (
                                <div className="absolute top-full right-0 mt-2 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-3 z-50">
                                    <form onSubmit={handleGlobalAppEdit}>
                                        <textarea 
                                            value={liveAppEditPrompt}
                                            onChange={(e) => setLiveAppEditPrompt(e.target.value)}
                                            placeholder="e.g., Change the navbar color to blue..."
                                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs text-gray-200 focus:border-purple-500 focus:outline-none mb-2 h-20 resize-none"
                                            autoFocus
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                type="button" 
                                                onClick={() => setShowLiveAppEdit(false)}
                                                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                type="submit"
                                                className="px-3 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-500"
                                            >
                                                Update
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}
                         </div>

                         <div className="w-px h-4 bg-gray-700 mx-1"></div>

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
                onTriggerAiEdit={handleTriggerAiEdit}
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