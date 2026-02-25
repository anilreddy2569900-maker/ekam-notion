import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatArea, type Message } from './components/ChatArea';
import { InputArea } from './components/InputArea';
import { Onboarding } from './components/Onboarding';
import { ProfileSettings } from './components/ProfileSettings';
import { MedicalRepository } from './components/MedicalRepository';
import { FitnessHub } from './components/Fitness/FitnessHub';
import { GuideModal } from './components/GuideModal';
import { useAuth } from './contexts/AuthContext';
import { storage, ref, uploadBytes, getDownloadURL } from './lib/firebase';
import { sendMessageToEkam, generateChatTitle, extractMemory, classifyLocally } from './lib/ekam_api';
import { routeToAgents } from './lib/ekam_api_local';
import { Login } from './components/Login';
import { supabase } from './lib/supabase';


const App: React.FC = () => {
  console.log("App: Executing component...");
  const { user, signInWithGoogle, signInWithGoogleRedirect, loading } = useAuth();

  // App State
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [view, setView] = useState<'chat' | 'settings' | 'vault' | 'fitness'>('chat');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [loadingPhase, setLoadingPhase] = useState<'gathering' | 'synthesizing' | 'done'>('done');
  const [thinkingProgress, setThinkingProgress] = useState<{
    phase: string;
    agents?: Record<string, { status: 'thinking' | 'done'; snippet?: string }>;
    selectedAgents?: string[];
  } | null>(null);
  const [chats, setChats] = useState<{ id: string, title: string, createdAt: any }[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [godMode, setGodMode] = useState(false); // ⚡ God Mode: all agents on PRO + medium thinking

  useEffect(() => {
    setBooted(true);
  }, []);

  // Fix for Stale Closure in Chat Listener
  const currentChatIdRef = React.useRef(currentChatId);
  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  // User Health Profile State
  const [userProfile, setUserProfile] = useState<Record<string, any> | null>(null);

  // Cross-Chat Memory State
  const [chatHistorySummary, setChatHistorySummary] = useState<string>('');

  // Health Records State (Vault files metadata for agent access)
  const [healthRecords, setHealthRecords] = useState<{ fileName: string; fileType: string; storagePath?: string; uploadedAt: any }[]>([]);

  // Location State
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);

  // Capture Geolocation
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          console.log('[App] Location captured:', position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.warn('[App] Geolocation denied or failed:', error.message);
        }
      );
    }
  }, []);

  // Load summaries from recent chats for cross-chat memory
  // Wrapped in useCallback to ensure it updates when currentChatId changes
  const loadChatHistory = React.useCallback(async () => {
    if (!user) return;
    try {
      // Get last 4 chats (excluding current)
      const { data: chatsSnap, error: chatsError } = await supabase
        .from('chats')
        .select('id, title')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false })
        .limit(4);

      if (chatsError) throw chatsError;

      const targetDocs = chatsSnap
        .filter(c => c.id !== currentChatId)
        .slice(0, 3);

      const summaryPromises = targetDocs.map(async (chat) => {
        const { data: msgsSnap, error: msgsError } = await supabase
          .from('messages')
          .select('role, content')
          .eq('chat_id', chat.id)
          .order('created_at', { ascending: true })
          .limit(5);
        
        if (msgsError) throw msgsError;
        if (msgsSnap.length === 0) return null;

        const chatTitle = chat.title || 'Untitled Chat';
        const msgsSummary = msgsSnap.map((m: any) => {
          return `${m.role === 'user' ? 'User' : 'Ekam'}: ${m.content.substring(0, 100)}...`;
        }).join('\n');

        return `**Chat: ${chatTitle}**\n${msgsSummary}`;
      });

      const results = await Promise.all(summaryPromises);
      const summaries = results.filter((s): s is string => s !== null);

      setChatHistorySummary(summaries.join('\n\n'));
      console.log('[App] Loaded chat history summary for cross-chat memory');
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  }, [user, currentChatId]);

  // Check for Health Data (Real-time Listener)
  useEffect(() => {
    if (!user) {
      setHasProfile(null);
      setUserProfile(null);
      return;
    }

    // Attempt to load from cache IMMEDIATELY for zero-latency load
    const cachedProfileStr = localStorage.getItem(`ekam_profile_${user.uid}`);
    if (cachedProfileStr) {
      try {
        const cachedProfile = JSON.parse(cachedProfileStr);
        setUserProfile(cachedProfile);
        setHasProfile(true);
        console.log('[App] Instantly loaded profile from local cache.');
      } catch (e) {
        console.warn('[App] Corrupted local profile cache, ignoring.');
      }
    }

    // Fetch profile and subscribe to changes
    const fetchProfile = async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('data')
        .eq('firebase_uid', user.uid);

      if (error) {
        console.error("Error fetching profile:", error);
        // Trust local cache if network/permission fails
        if (localStorage.getItem(`ekam_profile_${user.uid}`)) {
          setHasProfile(true);
        } else if (localStorage.getItem('ekam_onboarding_completed') === 'true') {
          setHasProfile(true);
        } else {
          setHasProfile(false);
        }
        return;
      }

      if (profiles && profiles.length > 0) {
        const data = profiles[0].data;
        setHasProfile(true);
        setUserProfile(data);
        localStorage.setItem(`ekam_profile_${user.uid}`, JSON.stringify(data));
        localStorage.setItem('ekam_onboarding_completed', 'true');
      } else {
        // Profile missing in Supabase
        const cachedProfileStr = localStorage.getItem(`ekam_profile_${user.uid}`);
        if (cachedProfileStr) {
          console.warn('[App] Profile missing in Supabase but exists locally. AUTO-HEALING Supabase...');
          try {
            const cachedProfile = JSON.parse(cachedProfileStr);
            await supabase.from('profiles').upsert({
              firebase_uid: user.uid,
              data: {
                ...cachedProfile,
                updatedAt: new Date().toISOString()
              },
              updated_at: new Date().toISOString()
            }, { onConflict: 'firebase_uid' });
            console.log('[App] Successfully healed Supabase profile from local cache!');
          } catch (healError) {
            console.error('[App] Failed to auto-heal Supabase profile:', healError);
          }
        } else {
          localStorage.removeItem('ekam_onboarding_completed');
          localStorage.removeItem(`ekam_profile_${user.uid}`);
          setHasProfile(false);
          setUserProfile(null);
        }
      }
    };

    fetchProfile();

    const channel = supabase
      .channel(`profile-${user.uid}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `firebase_uid=eq.${user.uid}`
      }, (payload) => {
        const data = payload.new.data;
        setHasProfile(true);
        setUserProfile(data);
        localStorage.setItem(`ekam_profile_${user.uid}`, JSON.stringify(data));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);


  // Load User's Chats
  useEffect(() => {
    if (!user) {
      setChats([]);
      setMessages([]);
      return;
    }

    const fetchChats = async () => {
      const { data, error } = await supabase
        .from('chats')
        .select('id, title, created_at')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching chats:", error);
        return;
      }

      if (data) {
        const loadedChats = data.map(c => ({
          id: c.id,
          title: c.title || 'New Chat',
          createdAt: c.created_at
        }));
        setChats(loadedChats);

        if (loadedChats.length > 0 && !currentChatIdRef.current) {
          setCurrentChatId(loadedChats[0].id);
        }
      }
    };

    fetchChats();

    const channel = supabase
      .channel(`chats-${user.uid}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chats',
        filter: `user_id=eq.${user.uid}`
      }, () => {
        fetchChats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Create first chat if none
  useEffect(() => {
    if (user && chats.length === 0 && !loading) {
      // createNewChat(); // Optional: Auto-create chat
    }
  }, [user, chats, loading]);

  // Load cross-chat memory on startup and when chat changes
  useEffect(() => {
    if (user && chats.length > 0) {
      loadChatHistory();
    }
  }, [user, chats, loadChatHistory]);

  // Load health records (vault files) metadata for agent access
  useEffect(() => {
    if (!user) return;

    const fetchVault = async () => {
      const { data, error } = await supabase
        .from('vault')
        .select('file_name, file_type, storage_path, uploaded_at')
        .eq('user_id', user.uid)
        .order('uploaded_at', { ascending: false });

      if (error) {
        console.error("Error fetching vault:", error);
        return;
      }

      if (data) {
        const records = data.map(f => ({
          fileName: f.file_name,
          fileType: f.file_type,
          storagePath: f.storage_path,
          uploadedAt: f.uploaded_at
        }));
        setHealthRecords(records);
        console.log('[App] Loaded health records for agent access:', records.length, 'files');
      }
    };

    fetchVault();

    const channel = supabase
      .channel(`vault-app-${user.uid}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'vault',
        filter: `user_id=eq.${user.uid}`
      }, () => {
        fetchVault();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);


  // Load Messages for Current Chat
  useEffect(() => {
    if (!user || !currentChatId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', currentChatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        return;
      }

      if (data) {
        const msgs: Message[] = data.map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          imageUrl: m.image_url,
          agentNotes: m.agent_notes,
        }));
        setMessages(msgs);
      }
    };

    fetchMessages();

    const channel = supabase
      .channel(`messages-${currentChatId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${currentChatId}`
      }, () => {
        fetchMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentChatId]);


  const createNewChat = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('chats').insert({
        user_id: user.uid,
        title: 'New Chat',
        created_at: new Date().toISOString()
      }).select();

      if (error) throw error;
      if (data && data.length > 0) {
        setCurrentChatId(data[0].id);
        setIsSidebarOpen(false);
        setView('chat'); // Reset to chat when new chat is created
      }
    } catch (e) {
      console.error("Error creating chat", e);
    }
  };

  const uploadImageToFirebase = async (file: File): Promise<string> => {
    if (!user) throw new Error("User not authenticated");
    const storageRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const handleSend = async (text: string, file?: File) => {
    if (!user || (!text.trim() && !file)) return;

    let activeChatId = currentChatId;
    if (!activeChatId) {
      // Create chat on first message
      const { data, error } = await supabase.from('chats').insert({
        user_id: user.uid,
        title: text.substring(0, 30) || 'New Chat',
        created_at: new Date().toISOString()
      }).select();
      
      if (error) {
        console.error("Error creating chat", error);
        return;
      }
      activeChatId = data[0].id;
      setCurrentChatId(activeChatId);
    }

    setIsTyping(true);

    try {
      let imageUrl = undefined;
      if (file) {
        imageUrl = await uploadImageToFirebase(file);
      }

      // Add user message to Supabase
      const { error: msgError } = await supabase.from('messages').insert({
        chat_id: activeChatId,
        user_id: user.uid,
        role: 'user',
        content: text,
        image_url: imageUrl || null,
        created_at: new Date().toISOString()
      });

      if (msgError) throw msgError;

      // 3. BACKGROUND: Trigger AI Response (Fire & Forget from UI perspective)
      // This allows the input input to clear immediately while AI thinks.
      (async () => {
        try {
          // Prepare History for Gemini (convert to API format)
          const historyForApi: { role: "user" | "model"; parts: { text: string }[] }[] = messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          }));

          // ----------------------------------------------------------------------
          // SEMANTIC ROUTER (GATEKEEPER)
          // ----------------------------------------------------------------------
          // Determine if this is a SIMPLE or COMPLEX query (instant, no network call)
          const mode = classifyLocally(text);
          console.log(`[App] Query routed to: ${mode} mode`);

          // Determine Agents — only for CRITICAL mode (skip agent routing for simple greetings)
          let unsubThinking: (() => void) | null = null;

          if (mode === 'CRITICAL') {
            const selectedAgents = routeToAgents(text);
            setActiveAgents(selectedAgents);
            setLoadingPhase('gathering');

            // Set up live thinking listener (Disabled for Supabase migration unless thinking table is created)
            /*
            const channel = supabase
              .channel(`thinking-${activeChatId}`)
              .on('postgres_changes', { event: '*', schema: 'public', table: 'thinking', filter: `chat_id=eq.${activeChatId}` }, (payload) => {
                const data = payload.new;
                setThinkingProgress({
                  phase: data.phase,
                  agents: data.agents,
                  selectedAgents: data.selected_agents
                });
              })
              .subscribe();
            unsubThinking = () => supabase.removeChannel(channel);
            */
          }

          // ----------------------------------------------------------------------
          // FLASH MEMORY (OBSERVER LAYER) - High-speed parallel execution
          // ----------------------------------------------------------------------
          // Only extract clinical memory for CRITICAL queries (skip for greetings/small talk)
          if (mode === 'CRITICAL') {
            extractMemory(text).then(async (facts) => {
              if (facts && facts.length > 0) {
                const updates: Record<string, any> = {};

                facts.forEach(f => {
                  const storageKey = f.category;
                  if (f.action === 'add' || f.action === 'update') {
                    updates[storageKey] = f.fact;
                  } else if (f.action === 'remove') {
                    updates[storageKey] = null; // null instead of deleteField
                  }
                });

                if (Object.keys(updates).length > 0) {
                  // 1. Optimistic UI Update
                  setUserProfile(prev => ({ ...prev, ...updates }));

                  // 2. Database Update (Fire & Forget)
                  try {
                    const { data: profiles } = await supabase
                      .from('profiles')
                      .select('data')
                      .eq('firebase_uid', user.uid);
                    
                    const existingData = profiles && profiles.length > 0 ? profiles[0].data : {};
                    const newData = { ...existingData, ...updates };
                    
                    // Remove keys with null value (mimicking deleteField)
                    Object.keys(updates).forEach(key => {
                      if (updates[key] === null) delete newData[key];
                    });

                    await supabase.from('profiles').upsert({
                      firebase_uid: user.uid,
                      data: newData,
                      updated_at: new Date().toISOString()
                    }, { onConflict: 'firebase_uid' });
                  } catch (e) {
                    console.error('[App] Flash Memory save failed:', e);
                  }
                }
              }
            });
          }

          // Send to Ekam Swarm Engine — SIMPLE mode skips heavy payload
          const ekamResponsePromise = sendMessageToEkam(
            text,
            historyForApi,
            imageUrl,
            userProfile,
            mode === 'CRITICAL' ? chatHistorySummary : undefined,
            mode === 'CRITICAL' ? healthRecords : undefined,
            location,
            mode,
            user.uid,
            activeChatId,
            godMode
          );

          // Wait for main response (this only blocks this background function)
          const ekamResponse = await ekamResponsePromise;

          // Clean up thinking listener
          if (unsubThinking) {
            unsubThinking();
            setThinkingProgress(null);
          }

          // CHECK FOR PROFILE UPDATES
          // Format: ||PROFILE_UPDATE: {"skinType": "Oily", "conditions": "Acne detected"}||
          const profileUpdateMatch = ekamResponse.text.match(/\|\|PROFILE_UPDATE:\s*(\{.*?\})\|\|/);
          if (profileUpdateMatch && profileUpdateMatch[1]) {
            try {
              const updates = JSON.parse(profileUpdateMatch[1]);

              const { data: profiles } = await supabase
                .from('profiles')
                .select('data')
                .eq('firebase_uid', user.uid);
              
              const existingData = profiles && profiles.length > 0 ? profiles[0].data : {};
              const newData = { ...existingData, ...updates };

              await supabase.from('profiles').upsert({
                firebase_uid: user.uid,
                data: newData,
                updated_at: new Date().toISOString()
              }, { onConflict: 'firebase_uid' });

              // Refresh local state immediately
              setUserProfile(prev => ({ ...prev, ...updates }));

              // Clean the hidden tag from the text before displaying
              ekamResponse.text = ekamResponse.text.replace(profileUpdateMatch[0], '').trim();
            } catch (e) {
              console.error('[App] Failed to apply profile update:', e);
            }
          }

          // ----------------------------------------------------------------------
          // ANIMATION CONCLUSION
          // ----------------------------------------------------------------------
          if (mode === 'CRITICAL') {
            setLoadingPhase('synthesizing');
            await new Promise(resolve => setTimeout(resolve, 800)); // Brief visual transition
          }

          // Reset loading state
          setLoadingPhase('done');
          setActiveAgents([]);

          // Log agent notes if council was used (for debugging, will be used in UI later)
          if (ekamResponse.usedCouncil && ekamResponse.agentNotes) {
            // console.log('[App] Council response with agent notes:', ekamResponse.agentNotes);
          }

          // Add AI message to Supabase
          const { error: aiMsgError } = await supabase.from('messages').insert({
            chat_id: activeChatId,
            user_id: user.uid,
            role: 'ai',
            content: ekamResponse.text,
            agent_notes: ekamResponse.agentNotes || null,
            created_at: new Date().toISOString()
          });

          if (aiMsgError) throw aiMsgError;

          // Auto-generate chat title after first message
          if (messages.length === 0 && activeChatId) {
            // Generate title in background (don't block the response)
            generateChatTitle(text).then(async (title) => {
              try {
                await supabase.from('chats').update({ title }).eq('id', activeChatId);
                console.log('[App] Updated chat title to:', title);
              } catch (e) {
                console.error('[App] Failed to update chat title:', e);
              }
            });
          }

        } catch (error) {
          console.error("Error generating AI response:", error);
          // Show error to user in chat
          try {
            if (activeChatId && user) {
              await supabase.from('messages').insert({
                chat_id: activeChatId,
                user_id: user.uid,
                role: 'ai',
                content: "I'm sorry, I encountered a temporary network issue. Please try sending your message again.",
                created_at: new Date().toISOString()
              });
            }
          } catch (e) {
            console.error("Failed to write error message:", e);
          }
        } finally {
          // Ensure UI resets even if error
          setIsTyping(false);
          setLoadingPhase('done');
          setActiveAgents([]);
        }
      })();
      // END BACKGROUND TASK
    } catch (error) {
      console.error("Error sending user message:", error);
      setIsTyping(false); // Only reset here if initial send failed
    }

    // Function returns immediately after user message is added.
    // InputArea will clear text now.
  };


  // 1. Loading State (Global)
  if (loading) {
    return <div className="h-screen w-screen bg-warm-charcoal flex items-center justify-center text-text-muted-zinc">Loading...</div>;
  }

  if (!user) {
    return <Login onLogin={signInWithGoogle} onLoginRedirect={signInWithGoogleRedirect} />;
  }

  // 3. Authenticated but Checking Profile
  if (hasProfile === null) {
    return <div className="h-screen w-screen bg-warm-charcoal flex items-center justify-center text-text-muted-zinc">Verifying Profile...</div>;
  }

  // 4. Authenticated but No Profile (Onboarding)
  if (hasProfile === false) {
    return <Onboarding onComplete={() => setHasProfile(true)} />;
  }

  // 5. Authenticated & Profile Exists (Main Chat App)
  return (
    <AnimatePresence>
      {booted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="flex flex-col h-[100dvh] bg-aurora text-text-cream overflow-hidden selection:bg-accent-clay/30 relative perspective-1000"
        >
          {/* <StarBackground /> Removed for Luxury Overhaul */}
          <Sidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            chats={chats}
            onNewChat={createNewChat}
            onSelectChat={(id) => {
              setCurrentChatId(id);
              setView('chat');
              setIsSidebarOpen(false);
            }}
            onOpenSettings={() => {
              setView('settings');
              setIsSidebarOpen(false);
            }}
            onOpenVault={() => {
              setView('vault');
              setIsSidebarOpen(false);
            }}
            onOpenFitness={() => {
              setView('fitness');
              setIsSidebarOpen(false);
            }}
            onOpenGuide={() => setIsGuideOpen(true)}
          />

          <GuideModal
            isOpen={isGuideOpen}
            onClose={() => setIsGuideOpen(false)}
          />
          <motion.div
            initial={{ z: -50, opacity: 0 }}
            animate={{ z: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2, type: "spring", stiffness: 50 }}
            className="flex-1 flex flex-col relative z-0 h-full preserve-3d"
          >
            {view === 'chat' ? (
              <>
                <Header onOpenSidebar={() => setIsSidebarOpen(true)} />
                <main className="flex-1 flex flex-col relative overflow-hidden w-full mx-auto">
                  <ChatArea
                    messages={messages}
                    isTyping={isTyping}
                    activeAgents={activeAgents}
                    loadingPhase={loadingPhase}
                    thinkingProgress={thinkingProgress}
                  />
                  <InputArea
                    onSend={handleSend}
                    disabled={isTyping}
                    godMode={godMode}
                    onGodModeToggle={() => setGodMode(prev => !prev)}
                  />
                </main>
              </>
            ) : view === 'settings' ? (
              <ProfileSettings onClose={() => setView('chat')} />
            ) : view === 'fitness' ? (
              <FitnessHub onClose={() => setView('chat')} />
            ) : (
              <MedicalRepository onClose={() => setView('chat')} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default App;
