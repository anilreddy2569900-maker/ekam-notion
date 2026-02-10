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
import { db, storage, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDocs, limit, updateDoc, deleteField, ref, uploadBytes, getDownloadURL } from './lib/firebase';
import { sendMessageToEkam, generateChatTitle, extractMemory, routeQuery } from './lib/ekam_api';
import { routeToAgents } from './lib/ekam_api_local';
import { Login } from './components/Login';


const App: React.FC = () => {
  console.log("App: Executing component...");
  const { user, signInWithGoogle, loading } = useAuth();

  // App State
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [view, setView] = useState<'chat' | 'settings' | 'vault' | 'fitness'>('chat');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [loadingPhase, setLoadingPhase] = useState<'gathering' | 'synthesizing' | 'done'>('done');
  const [chats, setChats] = useState<{ id: string, title: string, createdAt: any }[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    setBooted(true);
  }, []);

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
  const loadChatHistory = async () => {
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
  };

  // Check for Health Data (Real-time Listener)
  useEffect(() => {
    if (!user) {
      setHasProfile(null);
      setUserProfile(null);
      return;
    }

    const profileRef = doc(db, 'users', user.uid, 'profile', 'health_data');

    // Real-time listener for profile changes
    const unsubscribe = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        setHasProfile(true);
        setUserProfile(docSnap.data()); // Store full profile for AI context
        console.log('[App] User profile updated:', docSnap.data());
      } else {
        setHasProfile(false);
        setUserProfile(null);
      }
    }, (error) => {
      console.error("Error listening to profile:", error);
      setHasProfile(false); // Fallback
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

      if (loadedChats.length === 0 && !currentChatId) {
        // Avoid infinite loop by checking if we just tried to create one
      } else if (loadedChats.length > 0 && !currentChatId) {
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

  // Load cross-chat memory on startup
  useEffect(() => {
    if (user && chats.length > 0) {
      loadChatHistory();
    }
  }, [user, chats]);

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
    const storageRef = ref(storage, `users/${user.uid}/uploads/${Date.now()}_${file.name}`);
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

      // Add user message to Firestore
      await addDoc(collection(db, 'users', user.uid, 'chats', activeChatId, 'messages'), {
        role: 'user',
        content: text,
        imageUrl: imageUrl || null,
        createdAt: serverTimestamp()
      });

      // Prepare History for Gemini (convert to API format)
      const historyForApi: { role: "user" | "model"; parts: { text: string }[] }[] = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      // ----------------------------------------------------------------------
      // SEMANTIC ROUTER (GATEKEEPER)
      // ----------------------------------------------------------------------
      // Determine if this is a SIMPLE or COMPLEX query
      const mode = await routeQuery(text);
      console.log(`[App] Query routed to: ${mode} mode`);

      // Determine Agents (only relevant for COMPLEX mode really, but good for tracking)
      const selectedAgents = routeToAgents(text);
      setActiveAgents(selectedAgents);

      // CONDITIONAL ANIMATION START
      if (mode === 'CRITICAL') {
        // Trigger Neural Sphere for complex reasoning
        setLoadingPhase('gathering');
      } else {
        // For Express Lane (Simple), we will just let the "Typing..." state handle it
        // But we need to ensure ThinkingBubble handles 'gathering' vs 'express'
        // We'll set a special phase or handled by loadingPhase being 'done' but isTyping=true?
        // Actually, ThinkingState only shows if loadingPhase is 'gathering' or 'synthesizing'.
        // So if we DON'T set gathering, it won't show. Perf!
        // Standard ChatArea "isTyping" is active, so it will show dots if we have a component for it.
        // Current ChatArea implies it might not have standard dots if ThinkingState replaced it? 
        // Let's check ChatArea next. For now, assume isTyping=true is enough for simple UI.
      }

      // ----------------------------------------------------------------------
      // FLASH MEMORY (OBSERVER LAYER) - High-speed parallel execution
      // ----------------------------------------------------------------------
      extractMemory(text).then(async (facts) => {
        if (facts && facts.length > 0) {
          console.log('[App] Flash Memory captured:', facts);
          const updates: Record<string, any> = {};

          facts.forEach(f => {
            // Create a readable key for the fact
            // Simple fallback key gen, ideally we use what the LLM gave if it was a key-value pair,
            // but here we are receiving {category, fact}.
            // Let's store it dynamically as "Category: Fact".
            const storageKey = f.category;
            if (f.action === 'add' || f.action === 'update') {
              updates[storageKey] = f.fact;
            } else if (f.action === 'remove') {
              updates[storageKey] = deleteField(); // Special handling needed for delete field
            }
          });

          if (Object.keys(updates).length > 0) {
            // 1. Optimistic UI Update
            setUserProfile(prev => ({ ...prev, ...updates }));

            // 2. Database Update (Fire & Forget)
            try {
              const profileRef = doc(db, 'users', user.uid, 'profile', 'health_data');
              await updateDoc(profileRef, updates); // Note: deleteDoc() in updateDoc works for fields? No, needs deleteField()
            } catch (e) {
              console.error('[App] Flash Memory save failed:', e);
            }
          }
        }
      });

      // Send to Ekam Swarm Engine (Cloud Functions) - Main Thread
      const ekamResponsePromise = sendMessageToEkam(text, historyForApi, imageUrl, userProfile, chatHistorySummary, healthRecords, location, mode);

      // Wait for main response (don't technically need to wait for memory, but good for cleanup)
      const ekamResponse = await ekamResponsePromise;

      // CHECK FOR PROFILE UPDATES
      // Format: ||PROFILE_UPDATE: {"skinType": "Oily", "conditions": "Acne detected"}||
      const profileUpdateMatch = ekamResponse.text.match(/\|\|PROFILE_UPDATE:\s*(\{.*?\})\|\|/);
      if (profileUpdateMatch && profileUpdateMatch[1]) {
        try {
          const updates = JSON.parse(profileUpdateMatch[1]);
          console.log('[App] Applying AI Profile Updates:', updates);

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
        // Move to synthesizing phase briefly before completion
        setLoadingPhase('synthesizing');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Ensure animation is visible for at least 2s for "The Neural Wait" effect
      }

      // Reset loading state
      setLoadingPhase('done');
      setActiveAgents([]);

      // Log agent notes if council was used (for debugging, will be used in UI later)
      if (ekamResponse.usedCouncil && ekamResponse.agentNotes) {
        console.log('[App] Council response with agent notes:', ekamResponse.agentNotes);
      }

      // Add AI message to Firestore
      await addDoc(collection(db, 'users', user.uid, 'chats', activeChatId, 'messages'), {
        role: 'ai',
        content: ekamResponse.text,
        createdAt: serverTimestamp(),
        // Store agent notes for later retrieval if needed
        ...(ekamResponse.agentNotes && { agentNotes: ekamResponse.agentNotes })
      });

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
      console.error("Error sending message:", error);
    } finally {
      setIsTyping(false);
    }
  };



  // 1. Loading State (Global)
  if (loading) {
    return <div className="h-screen w-screen bg-warm-charcoal flex items-center justify-center text-text-muted-zinc">Loading...</div>;
  }

  if (!user) {
    return <Login onLogin={signInWithGoogle} />;
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
                  />
                  <InputArea
                    onSend={handleSend}
                    disabled={isTyping}
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
