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
    homepage: data.homepage,
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
    // If the API explicitly says base64, use our robust decoder
    if (data.encoding === 'base64' && data.content) {
        const cleanContent = data.content.replace(/\s/g, '');
        // Use a more robust UTF-8 decode strategy
        const binaryString = atob(cleanContent);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    } 
    
    // Fallback if not base64 or if structure is different
    if (data.content) {
        return atob(data.content.replace(/\s/g, ''));
    }
    
    return '';
  } catch (e) {
    console.error("Decoding error", e);
    // Attempt raw text fallback for some edge cases
    try {
        if (data.content) return atob(data.content);
    } catch (e2) {}
    
    return "Error: Could not decode file content. It might be binary or too large to preview.";
  }
};

// Helper to encode string to Base64 (UTF-8 safe)
const utf8_to_b64 = (str: string) => {
  return btoa(unescape(encodeURIComponent(str)));
};

export const commitFileToGitHub = async (
  owner: string, 
  repo: string, 
  path: string, 
  content: string, 
  token: string, 
  message: string,
  branch: string
) => {
  // 1. Check if file exists to get SHA (needed for update)
  let sha: string | undefined;
  try {
      const getResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
          headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json'
          }
      });
      if (getResponse.ok) {
          const data = await getResponse.json();
          sha = data.sha;
      }
  } catch (e) {
      // File likely doesn't exist, ignore
  }

  // 2. PUT request to create/update
  const body = {
      message: message,
      content: utf8_to_b64(content),
      branch: branch,
      ...(sha ? { sha } : {}) // Include SHA if updating
  };

  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(body)
  });

  if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API Error: ${errorData.message}`);
  }

  return await response.json();
};