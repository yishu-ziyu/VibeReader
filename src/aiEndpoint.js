const LOCAL_DEV_ORIGINS = new Set([
    'http://127.0.0.1:3217',
    'http://localhost:3217',
]);

export function resolveAiEndpointForRuntime(endpoint, origin = globalThis.location?.origin) {
    if (!endpoint || !LOCAL_DEV_ORIGINS.has(origin)) {
        return endpoint;
    }

    let parsed;
    try {
        parsed = new URL(endpoint);
    } catch (_) {
        return endpoint;
    }

    // MiniMax dev proxy routing
    if (parsed.origin === 'https://api.minimaxi.com' && parsed.pathname.startsWith('/anthropic/')) {
        return `${parsed.pathname.replace(/^\/anthropic/, '/api/minimax')}${parsed.search}`;
    }

    // Kimi/Moonshot dev proxy routing
    if (parsed.origin === 'https://api.moonshot.cn' && parsed.pathname.startsWith('/v1/')) {
        return `${parsed.pathname.replace(/^\/v1/, '/api/kimi')}${parsed.search}`;
    }

    return endpoint;
}

/**
 * 判断当前是否需要使用 Vite dev proxy
 * Tauri 运行时使用原生 HTTP，不需要 proxy；浏览器本地开发时才需要
 */
export function shouldUseDevProxy(endpoint, origin = globalThis.location?.origin) {
    if (!endpoint || !LOCAL_DEV_ORIGINS.has(origin)) {
        return false;
    }
    return resolveAiEndpointForRuntime(endpoint, origin) !== endpoint;
}

