import { FileNode, RepoDetails } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

export const parseRepoUrl = (url: string): { owner: string; repo: string } | null => {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== 'github.com') return null;
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch (e) {
    return null;
  }
};

export const fetchRepoDetails = async (owner: string, repo: string): Promise<RepoDetails> => {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);
  if (!response.ok) throw new Error('Repository not found');
  const data = await response.json();
  return {
    owner: data.owner.login,
    name: data.name,
    description: data.description,
    defaultBranch: data.default_branch,
    stars: data.stargazers_count,
  };
};

export const fetchRepoTree = async (owner: string, repo: string, branch: string): Promise<FileNode[]> => {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  if (!response.ok) throw new Error('Failed to fetch file tree');
  const data = await response.json();
  
  // Transform flat list to nested tree
  const tree: FileNode[] = [];
  const map: Record<string, FileNode> = {};

  // First pass: create nodes
  data.tree.forEach((item: any) => {
    map[item.path] = {
      path: item.path,
      name: item.path.split('/').pop() || '',
      type: item.type,
      sha: item.sha,
      url: item.url,
      children: item.type === 'tree' ? [] : undefined,
    };
  });

  // Second pass: build hierarchy
  data.tree.forEach((item: any) => {
    const node = map[item.path];
    const parts = item.path.split('/');
    if (parts.length === 1) {
      tree.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      if (map[parentPath] && map[parentPath].children) {
        map[parentPath].children!.push(node);
      }
    }
  });

  // Sort: Folders first, then files
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'tree' ? -1 : 1;
    });
    nodes.forEach(node => {
      if (node.children) sortNodes(node.children);
    });
  };
  
  sortNodes(tree);
  return tree;
};

export const fetchFileContent = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch file content');
  const data = await response.json();
  
  try {
    // Correctly handle UTF-8 content in Base64 (fixes emojis and special characters)
    const binaryString = atob(data.content.replace(/\s/g, ''));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error("Decoding error", e);
    return "Binary content or encoding not supported for preview.";
  }
};