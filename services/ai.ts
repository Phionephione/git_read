import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ChatMessage } from '../types';

// Ensure API Key is available
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const parseDataUrl = (dataUrl: string) => {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return null;
  return { mimeType: matches[1], data: matches[2] };
};

export const createChatStream = async (
  messages: ChatMessage[], 
  currentFileContext?: { path: string; content: string }
): Promise<AsyncIterable<string>> => {
  
  // Using gemini-2.5-flash for fast conversational responses
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
      If provided with an image, analyze the visual elements, UI/UX, or errors shown.
      `
    }
  });

  let textPrompt = lastMsg.text;
  
  if (currentFileContext) {
    textPrompt = `
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

  // Construct message with potential image part
  const msgParts: any[] = [{ text: textPrompt }];
  if (lastMsg.image) {
    const imgData = parseDataUrl(lastMsg.image);
    if (imgData) {
      msgParts.push({ inlineData: imgData });
    }
  }

  const result = await chat.sendMessageStream({ message: { parts: msgParts } });
  
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