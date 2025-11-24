import { GoogleGenAI, GenerateContentResponse, FunctionDeclaration, Type } from "@google/genai";
import { ChatMessage } from '../types';

// Ensure API Key is available
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const parseDataUrl = (dataUrl: string) => {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return null;
  return { mimeType: matches[1], data: matches[2] };
};

// Tool: Update File
const updateFileTool: FunctionDeclaration = {
  name: 'update_file',
  description: 'Update the code content of the current file. Use this when the user asks to modify the code based on instructions or an image.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      code: {
        type: Type.STRING,
        description: 'The full modified code content. Do not include markdown formatting.',
      },
      description: {
        type: Type.STRING,
        description: 'A brief description of the changes made.',
      }
    },
    required: ['code', 'description'],
  },
};

// Tool: Read File
const readFileTool: FunctionDeclaration = {
  name: 'read_file',
  description: 'Read the content of a file from the repository. Use this to inspect code, check logic, or understand dependencies that are not currently visible.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      path: {
        type: Type.STRING,
        description: 'The full path of the file to read (e.g., "src/components/App.tsx")',
      },
    },
    required: ['path'],
  },
};

export const createChatStream = async (
  messages: ChatMessage[], 
  fileStructure: string[], // List of all file paths in the repo
  currentFileContext: { path: string; content: string } | undefined,
  onToolCall: (toolCall: any) => void,
  onReadFile: (path: string) => Promise<string>
): Promise<AsyncIterable<string>> => {
  
  // Using gemini-2.5-flash for fast conversational responses and tool use
  const model = 'gemini-2.5-flash';
  
  // Construct a prompt history
  const lastMsg = messages[messages.length - 1];
  
  const history = messages.slice(0, -1).map(m => {
    const parts: any[] = [{ text: m.text }];
    if (m.image) {
      const imgData = parseDataUrl(m.image);
      if (imgData) {
        parts.push({ inlineData: imgData });
      }
    }
    return {
      role: m.role,
      parts: parts
    };
  });

  // Limit file list size to avoid context overflow if repo is massive
  const availableFiles = fileStructure.slice(0, 1500).join('\n');
  const truncatedWarning = fileStructure.length > 1500 ? `\n...(and ${fileStructure.length - 1500} more files)` : '';

  const systemInstruction = `You are an expert Senior Software Engineer and Code Reviewer. 
  You are assisting a user in viewing and improving a GitHub repository.
  
  OUTPUT FORMATTING:
  - Use Markdown for all responses.
  - Use code blocks with language specifiers for code.
  - Be concise but helpful.
  
  CONTEXT AWARENESS:
  You have access to the following files in the repository:
  ${availableFiles}${truncatedWarning}
  
  TOOLS:
  - 'read_file': Call this to read the content of any file in the list. You can call this multiple times to gather context.
  - 'update_file': Call this to modify the currently active file.
  
  STRATEGY:
  - If the user asks about the "app" or "repo" logic, and you don't have the file content in context, use 'read_file' to fetch the relevant files (e.g., index.tsx, App.tsx, package.json).
  - Don't guess. Read the files.
  `;

  const chat = ai.chats.create({
    model,
    history,
    config: {
      tools: [{ functionDeclarations: [updateFileTool, readFileTool] }],
      systemInstruction
    }
  });

  let textPrompt = lastMsg.text;
  
  // Implicitly provide the current file context if available, so it doesn't have to fetch it
  if (currentFileContext) {
    textPrompt = `
    [CURRENTLY OPEN FILE]
    Path: ${currentFileContext.path}
    Content:
    \`\`\`
    ${currentFileContext.content.slice(0, 30000)} 
    \`\`\`
    
    [USER QUERY]
    ${lastMsg.text}
    `;
  }

  // Construct message with potential image part
  const msgParts: any[] = [{ text: textPrompt }];
  if (lastMsg.image) {
    const imgData = parseDataUrl(lastMsg.image);
    if (imgData) {
      msgParts.push({ inlineData: imgData });
    }
  }

  return {
    async *[Symbol.asyncIterator]() {
      let currentSendPromise = chat.sendMessageStream({ message: { parts: msgParts } });

      // Agentic Loop: Keep processing until the model stops calling tools
      while (true) {
          const stream = await currentSendPromise;
          let toolCalled = false;

          for await (const chunk of stream) {
             const c = chunk as GenerateContentResponse;
             
             // Yield text chunks to user
             if (c.text) {
                 yield c.text;
             }

             // Handle Tool Calls
             if (c.functionCalls && c.functionCalls.length > 0) {
                 toolCalled = true;
                 
                 for (const call of c.functionCalls) {
                     if (call.name === 'read_file') {
                         const path = call.args['path'] as string;
                         yield `\n\n*Reading file: ${path}...*\n\n`;
                         
                         let content = "";
                         try {
                            content = await onReadFile(path);
                         } catch (e) {
                            content = "Error: Could not read file. It might not exist or is not a text file.";
                         }

                         // Send tool response back to model
                         currentSendPromise = chat.sendMessageStream({
                             functionResponses: [{
                                 name: call.name,
                                 id: call.id,
                                 response: { content: content.slice(0, 30000) } // Limit size
                             }]
                         });
                     } 
                     else if (call.name === 'update_file') {
                         onToolCall(call);
                         yield `\n\n*⚡ AI Auto-Update: ${call.args['description'] || 'Updating file...'}*\n\n`;
                         
                         // Send success response
                         currentSendPromise = chat.sendMessageStream({
                             functionResponses: [{
                                 name: call.name,
                                 id: call.id,
                                 response: { result: "File updated successfully." }
                             }]
                         });
                     }
                 }
             }
          }

          // If no tools were called in this turn, we are done
          if (!toolCalled) {
              break;
          }
      }
    }
  };
};

export const modifyCode = async (code: string, instruction: string, filename: string, image?: string): Promise<string> => {
  // Using gemini-3-pro-preview for superior code generation and vision capabilities
  const model = 'gemini-3-pro-preview'; 
  
  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction: `You are an expert coding assistant. 
      The user wants to modify a file named "${filename}".
      Return ONLY the valid, complete code for the modified file.
      Do not wrap it in markdown code blocks (like \`\`\`). 
      Do not include any conversational text.
      Just the raw code.
      
      Ensure you preserve the existing functionality unless asked to change it.
      If an image is provided, use it as a visual reference for the requested changes (e.g., matching colors, layout, or fixing UI bugs).
      `
    }
  });

  const textPrompt = code ? `
  [ORIGINAL CODE]
  ${code}

  [INSTRUCTION]
  ${instruction}
  ` : `
  [INSTRUCTION]
  ${instruction}
  
  Generate the full code for the file "${filename}".
  `;

  const msgParts: any[] = [{ text: textPrompt }];
  
  if (image) {
    const imgData = parseDataUrl(image);
    if (imgData) {
      msgParts.push({ inlineData: imgData });
    }
  }

  const result = await chat.sendMessage({ message: { parts: msgParts } });
  let text = result.text || '';
  
  // Robustly strip markdown code blocks if the model includes them
  text = text.trim();
  text = text.replace(/^```[\w-]*\s*/, '').replace(/\s*```$/, '');
  
  return text;
};