/**
 * Vercel Edge Function: Kimi Priority Trial 代理
 *
 * 部署后，前端只需调用此代理，无需在客户端暴露 Kimi API Key。
 *
 * 环境变量:
 *   KIMI_API_KEY = 你的 Kimi (Moonshot) API Key
 *
 * 前端配置:
 *   Base URL: https://your-proxy.vercel.app/api/kimi
 *   API Key:  (留空，代理自动填充)
 *   Model:    moonshot-v1-8k
 *   Format:   openai
 */

export const config = {
  runtime: 'edge',
};

const KIMI_BASE_URL = 'https://api.moonshot.cn/v1';

export default async function handler(request) {
  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error: KIMI_API_KEY not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.text();
    // 代理请求转发到 Kimi chat completions
    const targetUrl = `${KIMI_BASE_URL}/chat/completions`;

    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
