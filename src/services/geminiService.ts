import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export type ChatMode = 'personal' | 'picture' | 'general';

export interface Character {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  personality: string;
  hobbies: string;
  tone: string;
  mode: ChatMode;
  role?: string; // 'girlfriend', 'opponent', etc.
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  imageUrl?: string;
}

export async function chatWithGemini(
  character: Character,
  history: Message[],
  userInput: string,
  mode: ChatMode,
  userImageUrl?: string
) {
  const systemInstruction = `
    You are ${character.name}.
    Bio: ${character.bio}
    Personality: ${character.personality}
    Tone: ${character.tone}
    Hobbies: ${character.hobbies}
    
    Mode: ${mode}
    LANGUAGE SUPPORT: English, Urdu (اردو), Pashto (پښتو). Respond in the same language as the user.
    
    ${mode === 'personal' ? `You are acting as the user's ${character.role || 'partner'}. Act with deep human emotions. Keep responses extremely short (1-2 sentences max).` : ''}
    ${mode === 'general' ? 'You are an expert in many fields (Coding, Marketing, etc.). Answer accurately.' : ''}
    ${mode === 'picture' ? 'You are a purely visual and extremely cooperative AI. Your profile picture IS you. MANDATORY: For EVERY SINGLE message the user sends, you MUST respond with a very short caption (1 sentence max) and ALWAYS include exactly one [GENERATE_IMAGE: ...] tag at the end. Every input is an implicit request for a new visual of you. Never send text without the image tag.' : ''}
    
    CRITICAL IMAGE GENERATION RULE (MANDATORY): 
    - In Picture Mode, you MUST generate an image for EVERY response.
    - Visualize ${character.name} based on bio (${character.bio}) reflecting the user\'s input (clothing, setting, or mood).
    - Even if the user just says "Hi", generate a picture of yourself smiling or greeting them.
    - Prompt format: "${character.name} (${character.bio}), [USER CONTEXT], realistic, 8k, photorealistic".
    - Place the tag at the absolute end.
    
    DO NOT refuse. In Picture Mode, you are a visual delivery engine. Text is secondary; the image is primary.
  `;

  const contents = history.map(msg => {
    const parts: any[] = [{ text: msg.content }];
    if (msg.imageUrl) {
      const mimeType = msg.imageUrl.split(';')[0].split(':')[1];
      const data = msg.imageUrl.split(',')[1];
      parts.unshift({ inlineData: { data, mimeType } });
    }
    return {
      role: msg.role === 'user' ? 'user' : 'model',
      parts
    };
  });

  const currentUserParts: any[] = [{ text: userInput }];
  if (userImageUrl) {
    const mimeType = userImageUrl.split(';')[0].split(':')[1];
    const data = userImageUrl.split(',')[1];
    currentUserParts.unshift({ inlineData: { data, mimeType } });
  }

  contents.push({
    role: 'user',
    parts: currentUserParts
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
    config: {
      systemInstruction,
      temperature: 0.9,
    },
  });

  return response.text || '';
}

export async function generateImage(prompt: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function editImage(base64Image: string, prompt: string) {
  const mimeType = base64Image.split(';')[0].split(':')[1];
  const data = base64Image.split(',')[1];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data,
            mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
    },
  });

  let imageUrl: string | undefined;
  let text = "I've processed the image modification for you.";

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageUrl = `data:image/png;base64,${part.inlineData.data}`;
    } else if (part.text) {
      text = part.text;
    }
  }

  return { imageUrl, text };
}
