import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileContent, RepoDetails } from '../types';
import { Loader2, Eye, Code2, Sparkles, X, RefreshCw, FileText, FileX, AlertTriangle } from 'lucide-react';
import { modifyCode } from '../services/ai';

interface CodeViewerProps {
  file: FileContent | null;
  repoDetails: RepoDetails | null;
}

const CodeViewer: React.FC<CodeViewerProps> = ({ file, repoDetails }) => {
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [customContent, setCustomContent] = useState<string | null>(null);
  
  // AI Edit State
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isModifying, setIsModifying] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);

  // Reset state when file changes
  useEffect(() => {
    setCustomContent(null);
    setActiveTab('code');
    setShowAiInput(false);
    setAiPrompt('');
    setIncludeContext(true);
  }, [file?.path]);

  const handleAiModify = async () => {
    if (!file || !aiPrompt.trim()) return;
    
    setIsModifying(true);
    try {
      const currentCode = includeContext ? (customContent ?? file.content) : '';
      const newCode = await modifyCode(currentCode, aiPrompt, file.path);
      setCustomContent(newCode);
      setShowAiInput(false);
      setAiPrompt('');
      // Switch to preview automatically if it's an HTML file
      if (file.path.endsWith('.html')) {
        setActiveTab('preview');
      }
    } catch (error) {
      console.error("Failed to modify code", error);
      alert("Failed to modify code. Please try again.");
    } finally {
      setIsModifying(false);
    }
  };

  if (!file) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-gray-900">
        <div className="text-6xl mb-4 opacity-20">👋</div>
        <p>Select a file to view its content</p>
      </div>
    );
  }

  if (file.loading) {
    return (
      <div className="h-full flex items-center justify-center text-blue-400 bg-gray-900">
        <Loader2 className="animate-spin mr-2" />
        <span>Loading content...</span>
      </div>
    );
  }

  if (file.error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 bg-gray-900">
        <p>{file.error}</p>
      </div>
    );
  }

  const contentToRender = customContent ?? file.content;
  const isHtml = file.path.endsWith('.html');
  const isMarkdown = file.path.endsWith('.md');
  const canPreview = isHtml || isMarkdown;

  // Check if the content looks like a modern framework entry point (React, Vue, etc)
  const isFrameworkFile = isHtml && (
    contentToRender.includes('type="module"') || 
    contentToRender.includes('src="/src') ||
    contentToRender.includes('.tsx') ||
    contentToRender.includes('.vue') ||
    contentToRender.includes('%PUBLIC_URL%')
  );

  const getPreviewContent = () => {
    if (!repoDetails || !isHtml) return contentToRender;
    
    // 1. Calculate Base URL for the specific directory of this file
    // Example: if file is "src/pages/index.html", base is ".../src/pages/"
    const pathParts = file.path.split('/');
    pathParts.pop(); // Remove filename
    const dirPath = pathParts.join('/');
    const dirSuffix = dirPath ? `${dirPath}/` : '';

    const cdnRoot = `https://cdn.jsdelivr.net/gh/${repoDetails.owner}/${repoDetails.name}@${repoDetails.defaultBranch}/`;
    const cdnBase = `${cdnRoot}${dirSuffix}`;
    
    let processedContent = contentToRender;

    // 2. Rewrite root-relative paths (starting with /) to be absolute CDN paths
    // Regex matches src="/..." or href="/..." 
    // This fixes things like <script src="/src/main.ts"> or <link href="/styles.css">
    processedContent = processedContent.replace(
      /(src|href)=["']\/([^"']*)["']/g, 
      `$1="${cdnRoot}$2"`
    );

    // 3. Inject <base> tag for relative paths (./ or just filename)
    const baseTag = `<base href="${cdnBase}" target="_blank" />`;
    
    if (processedContent.includes('<head>')) {
      return processedContent.replace('<head>', `<head>${baseTag}`);
    } else {
      return `<!DOCTYPE html><html><head>${baseTag}</head><body>${processedContent}</body></html>`;
    }
  };

  const transformMarkdownUrl = (url: string) => {
    if (!repoDetails) return url;
    if (url.startsWith('http') || url.startsWith('https') || url.startsWith('#')) return url;
    
    // Handle root relative in MD
    if (url.startsWith('/')) {
        return `https://cdn.jsdelivr.net/gh/${repoDetails.owner}/${repoDetails.name}@${repoDetails.defaultBranch}${url}`;
    }

    // Handle relative to file location
    const pathParts = file.path.split('/');
    pathParts.pop();
    const dirPath = pathParts.join('/');
    const cleanUrl = url.startsWith('./') ? url.slice(2) : url;
    const separator = dirPath ? '/' : '';
    
    return `https://cdn.jsdelivr.net/gh/${repoDetails.owner}/${repoDetails.name}@${repoDetails.defaultBranch}/${dirPath}${separator}${cleanUrl}`;
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-gray-800 border-b border-gray-700 px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300 font-mono font-medium">{file.path}</span>
          {customContent && (
             <span className="text-xs bg-blue-900 text-blue-200 px-2 py-0.5 rounded-full border border-blue-700">Modified</span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
           {/* View Mode Toggle */}
           {canPreview && (
             <div className="flex bg-gray-900 rounded-lg p-0.5 border border-gray-700">
               <button 
                 onClick={() => setActiveTab('code')}
                 className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${activeTab === 'code' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
               >
                 <Code2 size={14} /> Code
               </button>
               <button 
                 onClick={() => setActiveTab('preview')}
                 className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${activeTab === 'preview' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
               >
                 <Eye size={14} /> Preview
               </button>
             </div>
           )}

           <div className="w-px h-6 bg-gray-700 mx-2"></div>

           {/* AI Actions */}
           <button 
             onClick={() => setShowAiInput(!showAiInput)}
             className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all border 
               ${showAiInput ? 'bg-purple-900/50 text-purple-200 border-purple-500' : 'bg-gray-800 text-purple-400 border-gray-600 hover:bg-gray-750 hover:border-purple-500/50'}`}
           >
             <Sparkles size={14} /> {customContent ? 'Modify Again' : 'Edit with AI'}
           </button>
           
           {customContent && (
             <button 
               onClick={() => setCustomContent(null)}
               className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
               title="Discard Changes"
             >
               <RefreshCw size={14} />
             </button>
           )}
        </div>
      </div>

      {/* AI Prompt Input Bar */}
      {showAiInput && (
        <div className="shrink-0 bg-gray-800/50 border-b border-gray-700 p-4 animate-in slide-in-from-top-2 duration-200">
          <div className="max-w-4xl mx-auto flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" size={16} />
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiModify()}
                  placeholder="Describe how to change this file (e.g., 'Add a dark mode button', 'Fix the indentation')..."
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg py-2 pl-10 pr-4 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  autoFocus
                />
              </div>
              <button
                onClick={handleAiModify}
                disabled={isModifying || !aiPrompt.trim()}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              >
                {isModifying ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Generate
              </button>
              <button 
                onClick={() => setShowAiInput(false)}
                className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-3 pl-1">
                <span className="text-xs text-gray-400 font-medium">Context:</span>
                <button
                    onClick={() => setIncludeContext(true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
                        includeContext 
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/50' 
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}
                >
                    <FileText size={14} />
                    Include File Content
                </button>
                <button
                    onClick={() => setIncludeContext(false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
                        !includeContext 
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/50' 
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                    }`}
                >
                    <FileX size={14} />
                    Exclude Content (New Gen)
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'preview' && canPreview ? (
          <div className="h-full w-full bg-white relative">
            {/* Framework Warning Overlay */}
            {isFrameworkFile && (
                <div className="absolute inset-x-0 top-0 z-10 bg-yellow-900/90 border-b border-yellow-700 p-3 text-yellow-200 text-xs flex items-center justify-center gap-2 backdrop-blur-sm">
                    <AlertTriangle size={14} />
                    <span>
                        <strong>Note:</strong> This looks like a framework file (React/Vue/etc). 
                        Browsers cannot run source code directly. This preview may fail or show a blank screen.
                    </span>
                </div>
            )}
            
            {isHtml ? (
              <iframe 
                title="preview"
                srcDoc={getPreviewContent()}
                className="w-full h-full border-none block"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            ) : (
              <div className="p-8 prose max-w-none h-full overflow-auto bg-gray-50 text-gray-900">
                <ReactMarkdown urlTransform={transformMarkdownUrl}>
                  {contentToRender}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full overflow-auto custom-scrollbar p-4">
             <pre className="font-mono text-sm text-gray-300 leading-relaxed tab-4">
              <code>{contentToRender}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeViewer;