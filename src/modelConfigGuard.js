export function validateRunnableModelConfig(config) {
    if (!config) {
        return {
            ok: false,
            code: 'missing_config',
            message: 'Select a model configuration before starting chat.',
        };
    }

    const baseUrl = String(config.baseUrl || config.baseURL || '').trim();
    const apiKey = String(config.apiKey || '').trim();
    const model = String(config.model || config.modelName || config.name || '').trim();
    const apiFormat = config.apiFormat || (config.apiType === 'anthropic-compatible' ? 'anthropic' : 'openai');
    const apiType = apiFormat === 'anthropic' ? 'anthropic-compatible' : 'openai-compatible';

    const requiresApiKey = config.requiresApiKey !== false &&
                           config.id !== 'preset-kimi-free-trial' &&
                           config.id !== 'kimi-free-trial' &&
                           !String(config.id || '').includes('free-trial') &&
                           !String(config.model || config.modelName || config.name || '').includes('free-trial');

    if (requiresApiKey && !apiKey) {
        return {
            ok: false,
            code: 'missing_api_key',
            message: 'Add an API key before starting chat.',
        };
    }

    if (!baseUrl) {
        return {
            ok: false,
            code: 'missing_base_url',
            message: 'Add a base URL before starting chat.',
        };
    }

    if (!model) {
        return {
            ok: false,
            code: 'missing_model',
            message: 'Add a model name before starting chat.',
        };
    }

    return {
        ok: true,
        config: {
            baseUrl,
            apiKey,
            model,
            modelName: model,
            apiFormat,
            apiType,
            ...(config.authType ? { authType: config.authType } : {}),
        },
    };
}
