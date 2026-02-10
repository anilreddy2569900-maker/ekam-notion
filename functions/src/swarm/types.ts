/**
 * Ekam Swarm Engine - Type Definitions
 */

// Agent identifiers
export type AgentKey =
    | 'orchestrator'
    | 'dermatologist'
    | 'metabolic'
    | 'somatic'
    | 'neuro'
    | 'guardian'
    | 'vitalist'
    | 'endocrine'
    | 'environment';

export type RoutableAgentKey = Exclude<AgentKey, 'orchestrator'>;

// User profile data
export interface UserProfile {
    gender?: string;
    dateOfBirth?: string;
    height?: string;
    weight?: string;
    diet?: string;
    skinType?: string;
    hairType?: string;
    allergies?: string;
    conditions?: string;
    medications?: string;
    goals?: string;
    [key: string]: unknown;
}

// Location data
export interface UserLocation {
    lat: number;
    lng: number;
}

// Message history format
export interface ChatMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

// Consultation record (Round Table Protocol)
export interface Consultation {
    from: AgentKey;
    to: AgentKey;
    question: string;
    answer: string;
}

// Agent execution result
export interface AgentResult {
    agent: AgentKey;
    note: string;
    consultations?: Consultation[];
}

// Swarm execution result
export interface SwarmResult {
    response: string;
    agentNotes: { agent: AgentKey; note: string }[];
    consultations?: Consultation[];
    symptoms?: { symptom: string; severity: string; timestamp: string }[];
    usedCouncil?: boolean;
}

// Attachment data for multimodal processing
export interface SwarmAttachment {
    storagePath: string;
    mimeType: string;
}

// Request payload for processMessage
export interface ProcessMessageRequest {
    message: string;
    history?: ChatMessage[];
    imageUrl?: string;
    attachments?: SwarmAttachment[]; // New: List of files (PDFs, Images)
    userProfile?: UserProfile;
    chatHistorySummary?: string;
    location?: UserLocation;
    mode?: 'SIMPLE' | 'CRITICAL';
}
