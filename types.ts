export interface FileNode {
  path: string;
  name: string;
  type: 'blob' | 'tree';
  sha: string;
  url: string;
  children?: FileNode[];
  isOpen?: boolean; // For UI state
}

export interface RepoDetails {
  owner: string;
  name: string;
  description: string;
  defaultBranch: string;
  stars: number;
  homepage?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface FileContent {
  path: string;
  content: string;
  loading: boolean;
  error?: string;
}