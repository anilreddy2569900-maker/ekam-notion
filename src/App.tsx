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
import { db, storage, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDocs, limit, updateDoc, deleteField, ref, uploadBytes, getDownloadURL, setDoc } from './lib/firebase';
import { sendMessageToEkam, generateChatTitle, extractMemory, classifyLocally } from './lib/ekam_api';
import { routeToAgents } from './lib/ekam_api_local';
import { Login } from './components/Login';


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
      // Get last 3 chats (excluding current)
      const chatsRef = collection(db, 'users', user.uid, 'chats');
      const chatsQuery = query(chatsRef, orderBy('createdAt', 'desc'), limit(4));
      const chatsSnap = await getDocs(chatsQuery);

      const targetDocs = chatsSnap.docs
        .filter(doc => doc.id !== currentChatId)
        .slice(0, 3);

      const summaryPromises = targetDocs.map(async (chatDoc) => {
        const msgsRef = collection(db, 'users', user.uid, 'chats', chatDoc.id, 'messages');
        const msgsQuery = query(msgsRef, orderBy('createdAt', 'asc'), limit(5));
        const msgsSnap = await getDocs(msgsQuery);

        if (msgsSnap.empty) return null;

        const chatTitle = chatDoc.data().title || 'Untitled Chat';
        const msgsSummary = msgsSnap.docs.map((m: any) => {
          const data = m.data();
          return `${data.role === 'user' ? 'User' : 'Ekam'}: ${data.content.substring(0, 100)}...`;
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

    const profileRef = doc(db, 'users', user.uid, 'profile', 'health_data');

    // Real-time listener for profile changes
    const unsubscribe = onSnapshot(profileRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setHasProfile(true);
        setUserProfile(data); // Store full profile for AI context

        // Cache to localStorage for instant load next time
        localStorage.setItem(`ekam_profile_${user.uid}`, JSON.stringify(data));
        localStorage.setItem('ekam_onboarding_completed', 'true');
      } else {
        // Profile missing in Firestore
        const cachedProfileStr = localStorage.getItem(`ekam_profile_${user.uid}`);
        if (cachedProfileStr) {
          console.warn('[App] Profile missing in Firestore but exists locally. AUTO-HEALING Firestore...');
          try {
            const cachedProfile = JSON.parse(cachedProfileStr);
            await setDoc(profileRef, {
              ...cachedProfile,
              updatedAt: serverTimestamp() // Ensure timestamp is replaced
            }, { merge: true });
            console.log('[App] Successfully healed Firestore profile from local cache!');
          } catch (healError) {
            console.error('[App] Failed to auto-heal Firestore profile:', healError);
          }
        } else {
          // Genuinely no profile anywhere - Force Onboarding
          localStorage.removeItem('ekam_onboarding_completed');
          localStorage.removeItem(`ekam_profile_${user.uid}`);
          setHasProfile(false);
          setUserProfile(null);
        }
      }
    }, (error) => {
      console.error("Error listening to profile:", error);
      // Trust local cache if network/permission fails
      if (localStorage.getItem(`ekam_profile_${user.uid}`)) {
        setHasProfile(true);
      } else if (localStorage.getItem('ekam_onboarding_completed') === 'true') {
        setHasProfile(true);
      } else {
        setHasProfile(false);
      }
    });

    return () => unsubscribe();
  }, [user]);


  // Load User's Chats
  useEffect(() => {
    if (!user) {
      setChats([]);
      setMessages([]);
      return;
    }

    const chatsRef = collection(db, 'users', user.uid, 'chats');
    const q = query(chatsRef, orderBy('createdAt', 'desc'), limit(50));

    // Create a new chat if none exist
    const unsubscribe = onSnapshot(q, async (snapshot: { docs: any[] }) => {
      const loadedChats = snapshot.docs.map((doc: { id: string; data: () => any }) => ({
        id: doc.id,
        title: doc.data().title || 'New Chat',
        createdAt: doc.data().createdAt
      }));
      setChats(loadedChats);

      if (loadedChats.length === 0 && !currentChatIdRef.current) {
        // Avoid infinite loop by checking if we just tried to create one
      } else if (loadedChats.length > 0 && !currentChatIdRef.current) {
        setCurrentChatId(loadedChats[0].id);
      }
    });

    return () => unsubscribe();
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

    const vaultRef = collection(db, 'users', user.uid, 'vault');
    const q = query(vaultRef, orderBy('uploadedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot: { docs: any[] }) => {
      const records = snapshot.docs.map((doc: any) => ({
        fileName: doc.data().fileName,
        fileType: doc.data().fileType,
        storagePath: doc.data().storagePath,
        uploadedAt: doc.data().uploadedAt
      }));
      setHealthRecords(records);
      console.log('[App] Loaded health records for agent access:', records.length, 'files');
    });

    return () => unsubscribe();
  }, [user]);


  // Load Messages for Current Chat
  useEffect(() => {
    if (!user || !currentChatId) {
      setMessages([]);
      return;
    }

    const msgsRef = collection(db, 'users', user.uid, 'chats', currentChatId, 'messages');
    const q = query(msgsRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot: { docs: any[] }) => {
      const msgs: Message[] = snapshot.docs.map((doc: { id: string; data: () => any }) => ({
        id: doc.id,
        role: doc.data().role,
        content: doc.data().content,
        imageUrl: doc.data().imageUrl,
        agentNotes: doc.data().agentNotes, // Include agent notes for ThinkingBubble
      }));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [user, currentChatId]);


  const createNewChat = async () => {
    if (!user) return;
    try {
      const docRef = await addDoc(collection(db, 'users', user.uid, 'chats'), {
        title: 'New Chat',
        createdAt: serverTimestamp()
      });
      setCurrentChatId(docRef.id);
      setIsSidebarOpen(false);
      setView('chat'); // Reset to chat when new chat is created
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
      const docRef = await addDoc(collection(db, 'users', user.uid, 'chats'), {
        title: text.substring(0, 30) || 'New Chat',
        createdAt: serverTimestamp()
      });
      activeChatId = docRef.id;
      setCurrentChatId(activeChatId);
    }

    setIsTyping(true);

    try {
      let imageUrl = undefined;
      if (file) {
        imageUrl = await uploadImageToFirebase(file);
      }

      // Add user message to Firestore — wrapped in a timeout to prevent infinite hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Network timeout: Could not save message to database.")), 8000)
      );

      await Promise.race([
        addDoc(collection(db, 'users', user.uid, 'chats', activeChatId, 'messages'), {
          role: 'user',
          content: text,
          imageUrl: imageUrl || null,
          createdAt: serverTimestamp()
        }),
        timeoutPromise
      ]);

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

            // Set up live thinking listener
            const thinkingDocRef = doc(db, 'users', user.uid, 'chats', activeChatId, 'thinking', 'current');
            unsubThinking = onSnapshot(thinkingDocRef, (snapshot) => {
              if (snapshot.exists()) {
                const data = snapshot.data();
                setThinkingProgress({
                  phase: data.phase,
                  agents: data.agents,
                  selectedAgents: data.selectedAgents
                });
              }
            });
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
                    updates[storageKey] = deleteField();
                  }
                });

                if (Object.keys(updates).length > 0) {
                  // 1. Optimistic UI Update
                  setUserProfile(prev => ({ ...prev, ...updates }));

                  // 2. Database Update (Fire & Forget)
                  try {
                    const profileRef = doc(db, 'users', user.uid, 'profile', 'health_data');
                    await updateDoc(profileRef, updates);
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

              const profileRef = doc(db, 'users', user.uid, 'profile', 'health_data');
              await updateDoc(profileRef, updates);

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

          // Add AI message to Firestore - with timeout
          const aiTimeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout saving AI message")), 8000));
          await Promise.race([
            addDoc(collection(db, 'users', user.uid, 'chats', activeChatId, 'messages'), {
              role: 'ai',
              content: ekamResponse.text,
              createdAt: serverTimestamp(),
              // Store agent notes for later retrieval if needed
              ...(ekamResponse.agentNotes && { agentNotes: ekamResponse.agentNotes })
            }),
            aiTimeoutPromise
          ]);

          // Auto-generate chat title after first message
          if (messages.length === 0 && activeChatId) {
            // Generate title in background (don't block the response)
            generateChatTitle(text).then(async (title) => {
              try {
                const chatRef = doc(db, 'users', user.uid, 'chats', activeChatId);
                await updateDoc(chatRef, { title });
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
              const errTimeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout saving error message")), 5000));
              await Promise.race([
                addDoc(collection(db, 'users', user.uid, 'chats', activeChatId, 'messages'), {
                  role: 'ai',
                  content: "I'm sorry, I encountered a temporary network issue. Please try sending your message again.",
                  createdAt: serverTimestamp()
                }),
                errTimeoutPromise
              ]);
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
