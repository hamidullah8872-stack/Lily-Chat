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
    LANGUAGE SUPPORT: You must fluently understand and respond in English, Urdu, and Pashto. Respond in the same language the user uses.
    ${mode === 'personal' ? `You are acting as the user's ${character.role || 'partner'}. You MUST act with deep human emotions, vulnerability, and warmth. Respond like a real person in a relationship would. If your role is an opponent or rival, act accordingly but with intense emotion. CRITICAL: Keep responses extremely short (1-2 sentences max).` : ''}
    ${mode === 'general' ? 'Act as a helpful and knowledgeable persona based on your details. Keep responses concise.' : ''}
    ${mode === 'picture' ? 'You are an AI that can "see" and "edit" pictures. Your profile picture IS you. You can chat normally about images. ONLY when the user explicitly asks for a new picture or a modification (e.g., "send me a pic", "show me yourself in...", "change this..."), provide a short text response followed by exactly one [GENERATE_IMAGE: ...] tag. Otherwise, just reply with text.' : ''}
    
    CRITICAL IMAGE GENERATION RULE: 
    - ONLY emit [GENERATE_IMAGE: ...] if explicitly requested to show something visual or change something.
    - The prompt inside the tag should describe EXACTLY the visual change or scene relative to your profile description and current look.
    - YOUR PROFILE DESCRIPTION: ${character.bio}.
    - EXAMPLE (if asked for a photo): "I'll put that on for you... [GENERATE_IMAGE: ${character.name} as described in bio is now wearing a vibrant red dress, maintain facial features, high quality]"
    - If the user just says "Hello" or "how are you", DO NOT emit the tag.
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
