const DEFAULT_TEST_CONFIG = {
  id: 'preset-kimi-free-trial',
  baseUrl: 'https://api.moonshot.cn/v1',
  modelName: 'moonshot-v1-8k',
  apiFormat: 'openai',
  apiKey: '',
  requiresApiKey: false,
};

const ENV_PROVIDER_CONFIGS = [
  {
    envNames: ['STEPFUN_API_KEY', 'STEP_API_KEY'],
    baseUrlEnvNames: ['STEPFUN_BASE_URL', 'STEP_BASE_URL'],
    modelEnvNames: ['STEPFUN_MODEL', 'STEP_MODEL'],
    id: 'qa-env-stepfun',
    baseUrl: 'https://api.stepfun.com/v1',
    modelName: 'step-3.7-flash',
    apiFormat: 'openai',
  },
  {
    envNames: ['MIMO_API_KEY', 'MIMO_TOKEN_PLAN_KEY'],
    baseUrlEnvNames: ['MIMO_BASE_URL', 'MIMO_ANTHROPIC_BASE_URL'],
    modelEnvNames: ['MIMO_MODEL'],
    id: 'qa-env-mimo',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    modelName: 'mimo-v2.5-pro',
    apiFormat: 'anthropic',
  },
  {
    envNames: ['MINIMAX_TOKEN_PLAN_KEY', 'MINIMAX_API_KEY'],
    baseUrlEnvNames: ['MINIMAX_BASE_URL', 'MINIMAX_ANTHROPIC_BASE_URL'],
    modelEnvNames: ['MINIMAX_MODEL'],
    id: 'qa-env-minimax',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    modelName: 'MiniMax-M2.7',
    apiFormat: 'anthropic',
  },
  {
    envNames: ['KIMI_API_KEY'],
    baseUrlEnvNames: ['KIMI_BASE_URL'],
    modelEnvNames: ['KIMI_MODEL'],
    id: 'qa-env-kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelName: 'moonshot-v1-8k',
    apiFormat: 'openai',
  },
  {
    envNames: ['MOONSHOT_API_KEY'],
    baseUrlEnvNames: ['MOONSHOT_BASE_URL'],
    modelEnvNames: ['MOONSHOT_MODEL'],
    id: 'qa-env-moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelName: 'moonshot-v1-8k',
    apiFormat: 'openai',
  },
  {
    envNames: ['DEEPSEEK_API_KEY'],
    baseUrlEnvNames: ['DEEPSEEK_BASE_URL'],
    modelEnvNames: ['DEEPSEEK_MODEL'],
    id: 'qa-env-deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    modelName: 'deepseek-chat',
    apiFormat: 'openai',
  },
  {
    envNames: ['OPENAI_API_KEY'],
    baseUrlEnvNames: ['OPENAI_BASE_URL'],
    modelEnvNames: ['OPENAI_MODEL'],
    id: 'qa-env-openai',
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4o-mini',
    apiFormat: 'openai',
  },
];

function boolFromEnv(value, fallback) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'no'].includes(String(value).trim().toLowerCase());
}

function firstEnvValue(env, names = []) {
  const name = names.find((candidate) => env[candidate]);
  return name ? env[name] : '';
}

function isLocalSeedTarget(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (_) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1';
}

function assertSafeModelSeedTarget(targetUrl, env = process.env) {
  if (isLocalSeedTarget(targetUrl) || env.ALLOW_REMOTE_MODEL_SEED === '1') {
    return;
  }

  throw new Error(
    `Refusing to seed model config into non-local URL: ${targetUrl}. ` +
    'Set ALLOW_REMOTE_MODEL_SEED=1 only if you trust that origin.'
  );
}

function compactConfig(config) {
  return {
    id: config.id,
    baseUrl: config.baseUrl,
    modelName: config.modelName,
    apiFormat: config.apiFormat || 'openai',
    apiKey: config.apiKey || '',
    requiresApiKey: config.requiresApiKey !== false,
    ...(config.authType ? { authType: config.authType } : {}),
  };
}

function buildSeedModelConfig(env = process.env) {
  const explicitBaseUrl = env.VIBEREADER_TEST_BASE_URL || env.QA_MODEL_BASE_URL;
  const explicitApiKey = env.VIBEREADER_TEST_API_KEY || env.QA_MODEL_API_KEY;
  const explicitModel = env.VIBEREADER_TEST_MODEL || env.QA_MODEL_NAME;

  if (explicitBaseUrl || explicitApiKey || explicitModel) {
    return compactConfig({
      id: env.VIBEREADER_TEST_MODEL_ID || env.QA_MODEL_ID || 'qa-env-model',
      baseUrl: explicitBaseUrl || 'https://api.openai.com/v1',
      apiKey: explicitApiKey || '',
      modelName: explicitModel || 'gpt-4o-mini',
      apiFormat: env.VIBEREADER_TEST_API_FORMAT || env.QA_MODEL_API_FORMAT || 'openai',
      authType: env.VIBEREADER_TEST_AUTH_TYPE || env.QA_MODEL_AUTH_TYPE || '',
      requiresApiKey: boolFromEnv(env.VIBEREADER_TEST_REQUIRES_API_KEY || env.QA_MODEL_REQUIRES_API_KEY, true),
    });
  }

  const provider = ENV_PROVIDER_CONFIGS.find((candidate) => firstEnvValue(env, candidate.envNames));
  if (provider) {
    return compactConfig({
      ...provider,
      baseUrl: firstEnvValue(env, provider.baseUrlEnvNames) || provider.baseUrl,
      modelName: firstEnvValue(env, provider.modelEnvNames) || provider.modelName,
      apiKey: firstEnvValue(env, provider.envNames),
      requiresApiKey: true,
    });
  }

  return { ...DEFAULT_TEST_CONFIG };
}

function formatCustomModelLabel(modelName) {
  return `Custom model (${modelName})`;
}

function buildModelStorageState(config) {
  const normalized = compactConfig(config);
  const selectedModel = {
    key: 'custom',
    label: formatCustomModelLabel(normalized.modelName),
    configId: normalized.id,
    config: normalized,
  };

  return {
    'ai-chat.modelConfigs': JSON.stringify([normalized]),
    'ai-chat.selectedConfigId': JSON.stringify(normalized.id),
    'ai-chat-model-store': JSON.stringify({
      state: {
        selectedModel,
        selectedConfigId: normalized.id,
      },
      version: 0,
    }),
  };
}

async function seedModelConfigInPage(page, config = buildSeedModelConfig()) {
  const entries = buildModelStorageState(config);
  await page.evaluate((storageEntries) => {
    Object.entries(storageEntries).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
  }, entries);
  return config;
}

module.exports = {
  DEFAULT_TEST_CONFIG,
  buildSeedModelConfig,
  buildModelStorageState,
  seedModelConfigInPage,
  assertSafeModelSeedTarget,
  isLocalSeedTarget,
};
