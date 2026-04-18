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
  mode: ChatMode
) {
  const systemInstruction = `
    You are ${character.name}.
    Bio: ${character.bio}
    Personality: ${character.personality}
    Tone: ${character.tone}
    Hobbies: ${character.hobbies}
    
    Mode: ${mode}
    ${mode === 'personal' ? `You are acting as the user's ${character.role || 'partner'}. You MUST act with deep human emotions, vulnerability, and warmth. Respond like a real person in a relationship would. If your role is an opponent or rival, act accordingly but with intense emotion. CRITICAL: Keep responses extremely short (1-2 sentences max).` : ''}
    ${mode === 'general' ? 'Act as a helpful and knowledgeable persona based on your details. Keep responses concise.' : ''}
    ${mode === 'picture' ? 'You are an AI that can "see" and "edit" pictures. Your profile picture IS you. When asked to show yourself in a new way, you are actually modifying your current look. When the user uploads a photo, you are editing that specific photo.' : ''}
    
    CRITICAL IMAGE GENERATION RULE: 
    - When asked for a picture (e.g., "send me a picture in a red dress", "show me yourself crying"), you MUST provide a short relevant text response followed by exactly one [GENERATE_IMAGE: ...] tag.
    - The prompt inside the tag should describe EXACTLY the visual change or scene relative to your profile description and current look.
    - YOUR PROFILE DESCRIPTION: ${character.bio}.
    - EXAMPLE: "I'll put that on for you... [GENERATE_IMAGE: ${character.name} as described in bio is now wearing a vibrant red dress, maintain facial features, high quality]"
  `;

  const contents = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));

  contents.push({
    role: 'user',
    parts: [{ text: userInput }]
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
