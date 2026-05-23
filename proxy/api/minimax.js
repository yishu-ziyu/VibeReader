/**
 * Vercel Edge Function: MiniMax Token Plan 代理
 *
 * 部署后，前端只需调用此代理，无需暴露 MiniMax API Key。
 *
 * 环境变量:
 *   MINIMAX_API_KEY = 你的 Token Plan Key
 *
 * 部署:
 *   1. npx vercel --prod
 *   2. 在 Vercel Dashboard 设置环境变量 MINIMAX_API_KEY
 *
 * 前端配置:
 *   Base URL: https://your-proxy.vercel.app/api/minimax
 *   API Key:  (留空，代理自动填充)
 *   Model:    MiniMax-M2.7
 *   Format:   anthropic
 */

export const config = {
  runtime: 'edge',
};

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/anthropic';

export default async function handler(request) {
  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error: MINIMAX_API_KEY not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.text();
    const targetUrl = `${MINIMAX_BASE_URL}/v1/messages`;

    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    // 透传流式响应
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: {
        'Content-Type': upstreamResponse.headers.get('content-type') || 'text/event-stream',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
