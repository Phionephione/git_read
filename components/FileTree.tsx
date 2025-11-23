import React, { useState } from 'react';
import { FileNode } from '../types';
import { Folder, FolderOpen, FileCode, File, FileJson, FileImage, ChevronRight, ChevronDown } from 'lucide-react';

interface FileTreeProps {
  nodes: FileNode[];
  onSelectFile: (node: FileNode) => void;
  selectedPath?: string;
}

const FileIcon = ({ name }: { name: string }) => {
  if (name.endsWith('.tsx') || name.endsWith('.ts') || name.endsWith('.js') || name.endsWith('.jsx')) return <FileCode size={16} className="text-blue-400" />;
  if (name.endsWith('.json')) return <FileJson size={16} className="text-yellow-400" />;
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.svg')) return <FileImage size={16} className="text-purple-400" />;
  return <File size={16} className="text-gray-400" />;
};

const TreeNode: React.FC<{ node: FileNode; onSelect: (n: FileNode) => void; selectedPath?: string; depth: number }> = ({ node, onSelect, selectedPath, depth }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'tree') {
      setIsOpen(!isOpen);
    } else {
      onSelect(node);
    }
  };

  const isSelected = selectedPath === node.path;

  return (
    <div>
      <div 
        onClick={handleClick}
        className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-colors text-sm
          ${isSelected ? 'bg-blue-900/40 text-blue-200 border-l-2 border-blue-500' : 'hover:bg-gray-800 text-gray-300'}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === 'tree' && (
          <span className="text-gray-500">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
        {node.type === 'tree' ? (
           isOpen ? <FolderOpen size={16} className="text-yellow-500" /> : <Folder size={16} className="text-yellow-500" />
        ) : (
          <FileIcon name={node.name} />
        )}
        <span className="truncate">{node.name}</span>
      </div>
      
      {node.type === 'tree' && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNode 
              key={child.path} 
              node={child} 
              onSelect={onSelect} 
              selectedPath={selectedPath}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const FileTree: React.FC<FileTreeProps> = ({ nodes, onSelectFile, selectedPath }) => {
  return (
    <div className="flex flex-col select-none pb-4">
      {nodes.map(node => (
        <TreeNode 
          key={node.path} 
          node={node} 
          onSelect={onSelectFile}
          selectedPath={selectedPath}
          depth={0}
        />
      ))}
    </div>
  );
};

export default FileTree;