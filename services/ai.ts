import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ChatMessage } from '../types';

// Ensure API Key is available
const apiKey = process.env.API_KEY;

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

export const createChatStream = async (
  messages: ChatMessage[], 
  currentFileContext?: { path: string; content: string }
): Promise<AsyncIterable<string>> => {
  
  // Using gemini-2.5-flash for fast conversational responses
  const model = 'gemini-2.5-flash';
  
  // Construct a prompt history
  const lastMsg = messages[messages.length - 1];
  const history = messages.slice(0, -1).map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  const chat = ai.chats.create({
    model,
    history,
    config: {
      systemInstruction: `You are an expert Senior Software Engineer and Code Reviewer. 
      You are assisting a user in viewing and improving a GitHub repository.
      
      Output Formatting:
      - Use Markdown for all responses.
      - Use code blocks with language specifiers for code.
      - Be concise but helpful.
      
      If provided with file context, specifically refer to lines of code if possible.
      `
    }
  });

  let prompt = lastMsg.text;
  
  if (currentFileContext) {
    prompt = `
    [CONTEXT]
    Current File: ${currentFileContext.path}
    File Content:
    \`\`\`
    ${currentFileContext.content.slice(0, 30000)} 
    \`\`\`
    (Content truncated if too long)
    
    [USER QUERY]
    ${lastMsg.text}
    `;
  }

  const result = await chat.sendMessageStream({ message: prompt });
  
  // Create an async iterable that yields text chunks
  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of result) {
         const c = chunk as GenerateContentResponse;
         if (c.text) {
             yield c.text;
         }
      }
    }
  };
};

export const modifyCode = async (code: string, instruction: string, filename: string): Promise<string> => {
  // Using gemini-3-pro-preview for superior code generation capabilities
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
      `
    }
  });

  const prompt = code ? `
  [ORIGINAL CODE]
  ${code}

  [INSTRUCTION]
  ${instruction}
  ` : `
  [INSTRUCTION]
  ${instruction}
  
  Generate the full code for the file "${filename}".
  `;

  const result = await chat.sendMessage({ message: prompt });
  let text = result.text || '';
  
  // Robustly strip markdown code blocks if the model includes them
  text = text.trim();
  text = text.replace(/^```[\w-]*\s*/, '').replace(/\s*```$/, '');
  
  return text;
};