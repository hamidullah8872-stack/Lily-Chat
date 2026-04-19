import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  Image as ImageIcon, 
  MessageSquare, 
  Plus, 
  ArrowLeft, 
  Send, 
  User, 
  Settings,
  Sparkles,
  Camera,
  Trash2,
  ChevronRight
} from 'lucide-react';
import { cn } from './lib/utils';
import { 
  Character, 
  Message, 
  ChatMode, 
  chatWithGemini, 
  generateImage, 
  editImage 
} from './services/geminiService';

export default function App() {
  const [view, setView] = useState<'dashboard' | 'create' | 'chat'>('dashboard');
  const [activeMode, setActiveMode] = useState<ChatMode>('personal');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const avatarCache = useRef<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load state from localStorage
  useEffect(() => {
    const savedChars = localStorage.getItem('lily_characters');
    const savedMessages = localStorage.getItem('lily_messages');
    if (savedChars) setCharacters(JSON.parse(savedChars));
    if (savedMessages) setMessages(JSON.parse(savedMessages));
  }, []);

  // Save state to localStorage with Quota protection
  useEffect(() => {
    try {
      localStorage.setItem('lily_characters', JSON.stringify(characters));
      localStorage.setItem('lily_messages', JSON.stringify(messages));
    } catch (e) {
      console.warn("Storage quota hit, pruning old messages...");
      // Prune messages: Keep only last 5 messages per character to free up space
      const prunedMessages: Record<string, Message[]> = {};
      Object.keys(messages).forEach(id => {
        prunedMessages[id] = messages[id].slice(-5);
      });
      setMessages(prunedMessages);
      try {
        localStorage.setItem('lily_messages', JSON.stringify(prunedMessages));
      } catch (innerE) {
        localStorage.clear(); // Emergency reset if still failing
      }
    }
  }, [characters, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeCharacterId]);

  const activeCharacter = characters.find(c => c.id === activeCharacterId);

  const handleCreateChat = (mode: ChatMode) => {
    setActiveMode(mode);
    setView('create');
  };

  const handleSaveCharacter = (char: Omit<Character, 'id'>) => {
    const newChar: Character = { ...char, id: crypto.randomUUID() };
    setCharacters([...characters, newChar]);
    setMessages({ ...messages, [newChar.id]: [] });
    setActiveCharacterId(newChar.id);
    setView('chat');
  };

  const handleDeleteCharacter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCharacters(characters.filter(c => c.id !== id));
    const newMessages = { ...messages };
    delete newMessages[id];
    setMessages(newMessages);
    if (activeCharacterId === id) setActiveCharacterId(null);
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !uploadingImage) || !activeCharacterId || !activeCharacter) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputText,
      timestamp: Date.now(),
      imageUrl: uploadingImage || undefined
    };

    const newChatHistory = [...(messages[activeCharacterId] || []), userMessage];
    setMessages({ ...messages, [activeCharacterId]: newChatHistory });
    setInputText('');
    setUploadingImage(null);
    setIsTyping(true);

    try {
      let responseText = '';
      let generatedImageUrl: string | null = null;

      const getBaseImage = async () => {
        if (uploadingImage) return uploadingImage;
        if (avatarCache.current[activeCharacter.id]) return avatarCache.current[activeCharacter.id];
        
        if (activeCharacter.avatar && activeCharacter.avatar.startsWith('data:image')) {
          avatarCache.current[activeCharacter.id] = activeCharacter.avatar;
          return activeCharacter.avatar;
        }

        if (activeCharacter.avatar && activeCharacter.avatar.startsWith('http')) {
          try {
            const resp = await fetch(activeCharacter.avatar, { mode: 'cors' });
            if (!resp.ok) return null;
            const blob = await resp.blob();
            const base64 = await new Promise<string>((resolve) => {
              const r = new FileReader();
              r.onloadend = () => resolve(r.result as string);
              r.readAsDataURL(blob);
            });
            avatarCache.current[activeCharacter.id] = base64;
            return base64;
          } catch { return null; }
        }
        return null;
      };

      // Start both tasks in parallel
      const [geminiResponse, baseImage] = await Promise.all([
        chatWithGemini(
          activeCharacter, 
          newChatHistory.slice(0, -1),
          userMessage.content, 
          activeMode,
          uploadingImage || undefined
        ),
        getBaseImage()
      ]);

      responseText = geminiResponse;
      
      // Extract tag
      let imageMatch = responseText.match(/\[\s*GENERATE_IMAGE\s*:\s*([\s\S]*?)\s*\]/i);
      
      // Fallback: If in picture mode and NO tag was generated, treat the whole response as the prompt
      if (!imageMatch && activeMode === 'picture' && responseText.trim().length > 0) {
        // Only if it doesn't look like a standard refusal
        const lowerText = responseText.toLowerCase();
        if (!lowerText.includes("cannot") && !lowerText.includes("sorry") && !lowerText.includes("unable")) {
          imageMatch = [null, responseText.trim()] as any;
        }
      }

      if (imageMatch) {
        const rawPrompt = imageMatch[1].trim();
        
        // Advanced Client-Side Artistic Re-mapping
        let enhancedPrompt = rawPrompt.toLowerCase();
        enhancedPrompt = enhancedPrompt.replace(/write (.*) on (your|her|my|the) (face|body|skin|chest)/gi, 'aesthetic body paint calligraphy reading "$1" on $3, artistic temporary ink graffiti');
        enhancedPrompt = enhancedPrompt.replace(/\bbra\b/gi, 'minimalist fine-art intimate wear');
        enhancedPrompt = enhancedPrompt.replace(/\bpanty\b/gi, 'matching artistic lace details');
        enhancedPrompt = enhancedPrompt.replace(/\bnude\b/gi, 'fine-art figure study, aesthetic silhouette photography');
        enhancedPrompt = enhancedPrompt.replace(/\bslut\b/gi, 'alluring high-fashion provocative expression');
        
        // Ensure character details and facial consistency are anchored in the prompt
        const faceAnchor = `Face of ${activeCharacter.name} (${activeCharacter.bio}), same facial features, specific identifiers from bio,`;
        const imagePrompt = `${faceAnchor} ${enhancedPrompt}, professional studio lighting, 8k, photorealistic, sharp focus, high detail`;
        
        // Optimize: If user asks for very specific skin-focused or intimate scenes, skip the dressed base image to avoid "clothed-bias"
        const isMinimalist = /\b(intimate|lingerie|skin|silhouette|study|minimalist)\b/i.test(enhancedPrompt);
        const baseImage = isMinimalist ? null : await getBaseImage();

        try {
          if (baseImage) {
            const editResult = await editImage(baseImage, imagePrompt);
            generatedImageUrl = editResult.imageUrl || null;
          } else {
            generatedImageUrl = await generateImage(imagePrompt);
          }
          
          if (!generatedImageUrl) {
             responseText += "\n\n(Note: The visual generation core hit a safety filter. To get your picture, try using more artistic photography terms like 'glamour modeling', 'fine-art silhouette', or 'aesthetic body art' instead of bold words.)";
          }
        } catch (imgError: any) {
          console.error("Visual engine error:", imgError);
          const errorMsg = imgError?.message || JSON.stringify(imgError);
          if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota")) {
            responseText += "\n\n(Note: You've reached the temporary Google API limit. I've activated the 'Turbo-Boost' fallback to try different visual engines, but if they are all busy, please wait a few minutes. For true unlimited generation, you would need to enable Billing in your Google AI Studio account.)";
          } else {
            responseText += "\n\n(Note: The visual generation model experienced an error or high load. Please retry in a few moments.)";
          }
        }
        
        // Clean up the text by removing the tag
        responseText = responseText.replace(/\[\s*GENERATE_IMAGE\s*:\s*[\s\S]*?\s*\]/gi, '').trim();
        
        // Ensure we don't send an empty bubble if everything was stripped
        if (activeMode === 'picture' && !responseText && !generatedImageUrl) {
          responseText = "I tried to generate that for you, but the visual core hit a safety limit. Try asking for a different scene or outfit!";
        }

        // If in picture mode and we have an image, we can hide the rest of the text if it was just a raw prompt fallback
        if (activeMode === 'picture' && generatedImageUrl && !geminiResponse.includes('[GENERATE_IMAGE')) {
          responseText = ""; // Hide the raw text we used as a prompt
        }
      }

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        content: responseText,
        timestamp: Date.now(),
        imageUrl: generatedImageUrl || undefined
      };

      setMessages(prev => ({
        ...prev,
        [activeCharacterId]: [...prev[activeCharacterId], aiMessage]
      }));
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadingImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex min-h-screen bg-brand-bg text-brand-text font-sans overflow-hidden">
      {/* Sidebar - Desktop Only */}
      <nav className="hidden md:flex w-20 flex-col items-center py-8 gap-10 bg-brand-sidebar border-r border-brand-border shrink-0">
        <div className="w-10 h-10 rounded-xl bg-linear-to-br from-brand-accent to-rose-400 flex items-center justify-center font-bold text-xl">L</div>
        <div className="flex flex-col gap-6">
          <button 
            onClick={() => setView('dashboard')}
            className={cn("p-2 transition-colors", view === 'dashboard' ? "text-brand-accent" : "text-brand-dim hover:text-white")}
          >
            <Sparkles className="w-6 h-6" />
          </button>
          <button className="p-2 text-brand-dim hover:text-white transition-colors">
            <User className="w-6 h-6" />
          </button>
          <button className="p-2 text-brand-dim hover:text-white transition-colors">
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </nav>

      <div className="flex-1 flex flex-col h-screen overflow-hidden overflow-y-auto">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-6xl w-full mx-auto p-6 md:p-12 relative pb-24"
            >
              <header className="mb-12">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Lily Chat</h1>
                <p className="text-brand-dim mt-2 text-lg">Select a workspace to begin interacting with your AI personas.</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
                <DashboardCard 
                  title="Personal Chat" 
                  desc="Create deep, emotional companions with unique backstories and persistent memory." 
                  icon={<Heart className="w-6 h-6 text-brand-accent" />}
                  onClick={() => handleCreateChat('personal')}
                  active={activeMode === 'personal'}
                  features={["Custom emotional profiles", "Persistent chat history", "Contextual image generation"]}
                />
                <DashboardCard 
                  title="Picture Chat" 
                  desc="Iterative visual design. Modify outfits, poses, and backgrounds via natural language." 
                  icon={<ImageIcon className="w-6 h-6 text-blue-400" />}
                  onClick={() => handleCreateChat('picture')}
                  active={activeMode === 'picture'}
                  features={["Advanced pose manipulation", "Wardrobe swaps on-the-fly", "Visual consistency engine"]}
                />
                <DashboardCard 
                  title="General Chat" 
                  desc="Expert personas for logic, productivity, and general knowledge acquisition." 
                  icon={<MessageSquare className="w-6 h-6 text-emerald-400" />}
                  onClick={() => handleCreateChat('general')}
                  active={activeMode === 'general'}
                  features={["Custom knowledge bases", "Defined tone & personality", "Powered by Google APIs"]}
                />
              </div>

              <div>
                <h2 className="text-xl font-medium mb-6 flex items-center gap-2 text-brand-dim uppercase tracking-wider text-sm">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Recent Experiences
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {characters.map(char => (
                    <div 
                      key={char.id}
                      onClick={() => {
                        setActiveCharacterId(char.id);
                        setActiveMode(char.mode);
                        setView('chat');
                      }}
                      className="group relative bg-brand-card border border-brand-border rounded-2xl p-4 cursor-pointer hover:border-brand-accent/30 transition-all overflow-hidden"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-brand-bg overflow-hidden flex-shrink-0 border border-brand-border">
                          {char.avatar ? <img src={char.avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 m-2.5 text-brand-dim" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm truncate">{char.name}</h3>
                          <p className="text-[10px] text-brand-dim uppercase tracking-wider">{char.mode}</p>
                        </div>
                        <button 
                          onClick={(e) => handleDeleteCharacter(char.id, e)}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:text-brand-accent transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {characters.length === 0 && (
                    <div className="col-span-full py-12 text-center text-brand-dim italic text-sm">
                      No personas found. Create one from a workspace above.
                    </div>
                  )}
                </div>
              </div>

              {/* Status Bar */}
              <div className="hidden md:flex absolute bottom-8 right-12 gap-6 text-[10px] text-brand-dim uppercase tracking-widest">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  System: Online
                </span>
                <span>v2.4.0 (Lily Engine)</span>
                <span>Cloud Sync Active</span>
              </div>
            </motion.div>
          )}

          {view === 'create' && (
            <motion.div 
              key="create"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-2xl w-full mx-auto p-6 md:p-12"
            >
              <button onClick={() => setView('dashboard')} className="flex items-center gap-2 text-brand-dim hover:text-white transition-colors mb-8 group">
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
              </button>
              <CharacterForm mode={activeMode} onSave={handleSaveCharacter} />
            </motion.div>
          )}

          {view === 'chat' && activeCharacter && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-full bg-brand-bg"
            >
              {/* Chat Header */}
              <header className="p-4 border-b border-brand-border flex items-center justify-between bg-brand-sidebar/80 backdrop-blur-xl sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <button onClick={() => setView('dashboard')} className="p-2 text-brand-dim hover:text-white transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-bg overflow-hidden border border-brand-border">
                      {activeCharacter.avatar ? <img src={activeCharacter.avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 m-2.5 text-brand-dim" />}
                    </div>
                    <div>
                      <h2 className="font-medium text-sm leading-none">{activeCharacter.name}</h2>
                      <span className="text-[10px] text-brand-dim uppercase tracking-widest">{activeMode} Assistant</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-2 text-brand-dim hover:text-white transition-colors rounded-lg hover:bg-white/5">
                    <Settings className="w-5 h-5" />
                  </button>
                </div>
              </header>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
                <div className="max-w-4xl mx-auto flex flex-col space-y-8">
                  {messages[activeCharacterId]?.map((msg) => (msg.content || msg.imageUrl) && (
                    <div 
                      key={msg.id} 
                      className={cn(
                        "flex flex-col max-w-[90%] md:max-w-[80%]",
                        msg.role === 'user' ? "ml-auto items-end" : "items-start"
                      )}
                    >
                      {msg.imageUrl && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="mb-3 rounded-2xl overflow-hidden shadow-2xl border border-brand-border group relative"
                        >
                          <img src={msg.imageUrl} alt="AI Content" className="max-w-full h-auto" />
                          <div className="absolute inset-0 bg-brand-accent/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </motion.div>
                      )}
                      {msg.content && (
                        <div className={cn(
                          "px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm",
                          msg.role === 'user' 
                            ? "bg-brand-accent text-white rounded-tr-none" 
                            : "bg-brand-card text-brand-text rounded-tl-none border border-brand-border"
                        )}>
                          {msg.content}
                        </div>
                      )}
                      <span className="text-[10px] text-brand-dim mt-2 tracking-wider">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex gap-3 items-center text-brand-dim text-xs italic">
                      <div className="flex gap-1.5 items-center">
                        <div className="flex gap-1">
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-1 rounded-full bg-brand-accent" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 rounded-full bg-brand-accent" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 rounded-full bg-brand-accent" />
                        </div>
                        <span className="tracking-wide">{activeCharacter.name} is formulating a response...</span>
                      </div>
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <footer className="p-4 md:p-6 bg-brand-bg border-t border-brand-border">
                <div className="max-w-4xl mx-auto">
                  {uploadingImage && (
                    <div className="mb-4 relative inline-block">
                      <img src={uploadingImage} alt="Preview" className="h-24 w-24 object-cover rounded-2xl border border-brand-accent/50 shadow-lg shadow-brand-accent/10" />
                      <button 
                        onClick={() => setUploadingImage(null)}
                        className="absolute -top-3 -right-3 bg-brand-card rounded-full p-2 border border-brand-border hover:border-brand-accent text-brand-dim hover:text-brand-accent shadow-xl transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-3 items-end">
                    {activeMode === 'picture' && (
                      <label className="p-4 bg-brand-card border border-brand-border rounded-2xl cursor-pointer hover:border-brand-accent/30 transition-all hover:bg-white/5 active:scale-95">
                        <Camera className="w-5 h-5 text-brand-dim" />
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    )}
                    <div className="flex-1 relative">
                      <textarea
                        rows={1}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Draft a message..."
                        className="w-full bg-brand-card border border-brand-border rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-brand-accent/50 focus:ring-1 focus:ring-brand-accent/20 resize-none max-h-40 transition-all placeholder:text-brand-dim/50 shadow-inner"
                      />
                    </div>
                    <button 
                      onClick={handleSendMessage}
                      disabled={!inputText.trim() && !uploadingImage}
                      className="p-4 bg-brand-accent rounded-2xl hover:brightness-110 disabled:opacity-30 transition-all shadow-xl shadow-brand-accent/10 active:scale-95 group"
                    >
                      <Send className="w-5 h-5 text-white group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              </footer>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DashboardCard({ title, desc, icon, onClick, active, features }: { 
  title: string; 
  desc: string; 
  icon: React.ReactNode; 
  onClick: () => void;
  active: boolean;
  features: string[];
}) {
  return (
    <motion.div 
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.98 }}
      className="bg-brand-card border border-brand-border rounded-[24px] p-8 flex flex-col justify-between relative overflow-hidden group transition-all hover:shadow-2xl hover:shadow-brand-accent/5"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-radial from-brand-accent/10 to-transparent pointer-none" />
      
      <div>
        <div className="w-14 h-14 bg-white/5 border border-brand-border rounded-2xl flex items-center justify-center mb-6 shadow-inner group-hover:border-brand-accent/20 transition-colors">
          {icon}
        </div>
        <h3 className="text-2xl font-semibold mb-3 tracking-tight">{title}</h3>
        <p className="text-sm text-brand-dim leading-relaxed mb-6">{desc}</p>
        
        <ul className="space-y-3 mb-8">
          {features.map((f, i) => (
            <li key={i} className="flex items-center gap-2.5 text-[13px] text-brand-dim/80">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-accent/60" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <button 
        onClick={onClick}
        className={cn(
          "w-full py-4 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] shadow-lg",
          active 
            ? "bg-brand-accent text-white shadow-brand-accent/20" 
            : "bg-white/5 text-white border border-brand-border hover:bg-white/10"
        )}
      >
        {active ? "Continue Session" : "Enter workspace"}
      </button>
    </motion.div>
  );
}

function CharacterForm({ mode, onSave }: { mode: ChatMode, onSave: (char: Omit<Character, 'id'>) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    personality: '',
    hobbies: '',
    tone: 'Casual and Warm',
    avatar: '',
    role: mode === 'personal' ? 'Girlfriend' : '',
    mode
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 bg-brand-card p-10 rounded-[32px] border border-brand-border shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-48 h-48 bg-radial from-brand-accent/5 to-transparent pointer-none" />
      
      <div className="flex items-center gap-5 mb-2 relative">
        <div className="p-4 rounded-2xl bg-white/5 border border-brand-border text-brand-accent shadow-inner">
          <Settings className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Configure Identity</h2>
          <p className="text-brand-dim text-sm mt-1">Sculpt the parameters of your AI companion.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
        <label className="block space-y-2.5">
          <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-brand-dim">Identifier</span>
          <input 
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            className="w-full bg-brand-bg border border-brand-border rounded-xl px-5 py-3.5 text-sm focus:outline-none focus:border-brand-accent/40 transition-all placeholder:text-brand-dim/30"
            placeholder="e.g. Lily, Astraea..."
          />
        </label>
        
        {mode === 'personal' && (
          <label className="block space-y-2.5">
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-brand-dim">Designated Relation</span>
            <input 
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value })}
              className="w-full bg-brand-bg border border-brand-border rounded-xl px-5 py-3.5 text-sm focus:outline-none focus:border-brand-accent/40 transition-all placeholder:text-brand-dim/30"
              placeholder="e.g. Partner, Competitor..."
            />
          </label>
        )}
      </div>

      <label className="block space-y-2.5 relative">
        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-brand-dim">Narrative Backstory & Aesthetics</span>
        <textarea 
          rows={4}
          value={formData.bio}
          onChange={e => setFormData({ ...formData, bio: e.target.value })}
          className="w-full bg-brand-bg border border-brand-border rounded-xl px-5 py-4 text-sm focus:outline-none focus:border-brand-accent/40 transition-all resize-none placeholder:text-brand-dim/30"
          placeholder="Detailed physical and biographical data..."
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
        <label className="block space-y-2.5">
          <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-brand-dim">Personality Core</span>
          <input 
            value={formData.personality}
            onChange={e => setFormData({ ...formData, personality: e.target.value })}
            className="w-full bg-brand-bg border border-brand-border rounded-xl px-5 py-3.5 text-sm focus:outline-none focus:border-brand-accent/40 transition-all placeholder:text-brand-dim/30"
            placeholder="Empathetic, Analytical, Bold..."
          />
        </label>
        <label className="block space-y-2.5">
          <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-brand-dim">Vernacular Mode</span>
          <input 
            value={formData.tone}
            onChange={e => setFormData({ ...formData, tone: e.target.value })}
            className="w-full bg-brand-bg border border-brand-border rounded-xl px-5 py-3.5 text-sm focus:outline-none focus:border-brand-accent/40 transition-all placeholder:text-brand-dim/30"
            placeholder="Eloquent, Street-smart, Soft..."
          />
        </label>
      </div>

      <label className="block space-y-2.5 relative">
        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-brand-dim">Visual Reference URL</span>
        <input 
          value={formData.avatar}
          onChange={e => setFormData({ ...formData, avatar: e.target.value })}
          className="w-full bg-brand-bg border border-brand-border rounded-xl px-5 py-3.5 text-sm focus:outline-none focus:border-brand-accent/40 transition-all placeholder:text-brand-dim/30"
          placeholder="Direct link to source image..."
        />
      </label>

      <button 
        type="submit"
        className="w-full py-4.5 bg-brand-accent text-white rounded-2xl font-bold tracking-widest uppercase text-xs hover:brightness-110 transition-all shadow-2xl shadow-brand-accent/20 active:scale-[0.99] relative"
      >
        Initialize Neural Sync
      </button>
    </form>
  );
}
