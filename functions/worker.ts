import { createClient } from '@supabase/supabase-js';
import { runSwarm } from './src/swarm/engine';
import { setSiliconFlowApiKey } from './src/utils/siliconflow';

// This is the Cloudflare Worker entry point
// It replaces the Firebase Functions index.ts

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SILICONFLOW_API_KEY: string;
  TELEGRAM_WEBHOOK_BASE_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Set API Key for SiliconFlow client
    setSiliconFlowApiKey(env.SILICONFLOW_API_KEY);

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. Handle processMessage (Main AI Call)
      if (url.pathname === '/processMessage') {
        const payload = await request.json();

        // Call the Swarm Engine logic
        const result = await runSwarm(
          payload.message,
          payload.history || [],
          payload.userProfile,
          payload.location,
          payload.imageUrl, // imageUrl from frontend is usually a URL or base64 
          undefined, // imageMimeType
          payload.chatHistorySummary,
          payload.mode || 'CRITICAL',
          payload.attachments,
          undefined, // onProgress disabled for worker to avoid Firebase dependency
          payload.godMode
        );

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. Handle Telegram Webhook (Placeholder for now)
      if (url.pathname === '/telegramWebhook') {
        return new Response('OK', { status: 200 });
      }

      // 3. Handle Bot Registration (Placeholder for now)
      if (url.pathname === '/registerTelegramBot') {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404 });

    } catch (error: any) {
      console.error('[Worker Error]', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
