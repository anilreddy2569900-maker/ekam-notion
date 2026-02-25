/**
 * EKAM - SiliconFlow API Client
 * 
 * Unified client for all LLM interactions via SiliconFlow.
 * Replaces the old OpenRouter/Vertex AI client with OpenAI-compatible API.
 * 
 * 4-Tier Architecture:
 *   CORE  → deepseek-ai/DeepSeek-V3        (All serious reasoning)
 *   LITE  → meta-llama/Meta-Llama-3.1-8B-Instruct  (Routing, Express Lane, Environment)
 *   DERM  → Qwen/Qwen2.5-VL-72B-Instruct      (Default vision dermatologist)
 *   DERM_ESCALATION → Pro/THUDM/glm-4v-9b           (Heavy derm, only on escalation)
 */

import * as logger from './logger';
import { AI_CONFIG, ModelTier } from '../config/ai_config';

// ============================================================================
// API CONFIGURATION
// ============================================================================

const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1/chat/completions';

// API key will be injected at call time from Firebase Secrets
let _apiKey: string | undefined;

export function setSiliconFlowApiKey(key: string): void {
    _apiKey = key;
}

function getApiKey(): string {
    if (!_apiKey) {
        throw new Error('[SiliconFlow] API key not set. Call setSiliconFlowApiKey() first.');
    }
    return _apiKey;
}

// ============================================================================
// TYPES
// ============================================================================

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | ContentPart[];
}

export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

export interface ChatCompletionOptions {
    /** Model tier to use */
    tier: ModelTier;
    /** System instruction / prompt */
    systemInstruction?: string;
    /** User message(s) — can be a simple string or array of ChatMessage */
    messages: ChatMessage[];
    /** Max output tokens */
    maxTokens?: number;
    /** Temperature (0-2) */
    temperature?: number;
    /** Force JSON output */
    jsonMode?: boolean;
}

export interface ChatCompletionResult {
    text: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// ============================================================================
// CORE API FUNCTION
// ============================================================================

/**
 * Make a chat completion request to SiliconFlow.
 * This is the ONE function that replaces all model calls.
 */
export async function chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const modelId = AI_CONFIG.models[options.tier];
    const apiKey = getApiKey();

    // Build message array: system instruction first, then conversation messages
    const messages: ChatMessage[] = [];

    if (options.systemInstruction) {
        messages.push({
            role: 'system',
            content: options.systemInstruction,
        });
    }

    messages.push(...options.messages);

    // Build request body
    const body: Record<string, unknown> = {
        model: modelId,
        messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 1,
    };

    if (options.jsonMode) {
        body.response_format = { type: 'json_object' };
    }

    try {
        const response = await fetch(SILICONFLOW_BASE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`[SiliconFlow] API Error ${response.status}:`, errorText);
            throw new Error(`SiliconFlow API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        const text = data.choices?.[0]?.message?.content || '';
        const usage = data.usage ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
        } : undefined;

        return { text, usage };

    } catch (error) {
        logger.error(`[SiliconFlow] Request failed for ${modelId}:`, error);
        throw error;
    }
}

// ============================================================================
// VISION HELPER
// ============================================================================

/**
 * Build a user message with an image attachment for vision models.
 * Converts base64 image data into OpenAI-compatible content parts.
 */
export function buildVisionMessage(
    textPrompt: string,
    imageBase64?: string,
    imageMimeType?: string,
): ChatMessage {
    const parts: ContentPart[] = [{ type: 'text', text: textPrompt }];

    if (imageBase64 && imageMimeType) {
        parts.push({
            type: 'image_url',
            image_url: {
                url: `data:${imageMimeType};base64,${imageBase64}`,
            },
        });
    }

    return { role: 'user', content: parts };
}

// ============================================================================
// RETRY WRAPPER
// ============================================================================

/**
 * Retry wrapper for SiliconFlow calls with exponential backoff.
 */
export async function chatCompletionWithRetry(
    options: ChatCompletionOptions,
    maxRetries = 3,
    initialDelay = 500,
): Promise<ChatCompletionResult> {
    let lastError: Error | undefined;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await chatCompletion(options);
        } catch (error: any) {
            lastError = error;

            // Check for rate limiting (429)
            if (error.message?.includes('429') || error.message?.includes('rate')) {
                const delay = initialDelay * Math.pow(2, i);
                logger.warn(`[SiliconFlow] Rate limited, retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // Non-retryable error
            throw error;
        }
    }

    throw lastError || new Error('[SiliconFlow] Max retries exceeded');
}
