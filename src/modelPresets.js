/**
 * 模型预设配置（ProviderPreset 抽象层）
 * 覆盖全球和中国主要 AI 提供商
 */

// ==================== ProviderPreset 定义 ====================

const PROVIDER_PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    apiType: 'openai-compatible',
    region: 'global',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', vision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', vision: true },
      { id: 'o3-mini', name: 'o3-mini', vision: false },
      { id: 'o1', name: 'o1', vision: false },
    ],
    doc: 'https://platform.openai.com/docs',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    apiType: 'anthropic-compatible',
    region: 'global',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', vision: true },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', vision: true },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', vision: true },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', vision: true },
    ],
    doc: 'https://docs.anthropic.com',
    apiKeyPlaceholder: 'sk-ant-...',
    requiresApiKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek-V3', vision: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1', vision: false },
    ],
    doc: 'https://platform.deepseek.com/api-docs',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3 (SF)', vision: false },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek-R1 (SF)', vision: false },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5-72B', vision: false },
    ],
    doc: 'https://docs.siliconflow.cn',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
  },
  {
    id: 'aliyun-bailian',
    name: '阿里云百炼',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    models: [
      { id: 'qwen-max', name: '通义千问-Max', vision: true },
      { id: 'qwen-plus', name: '通义千问-Plus', vision: true },
      { id: 'qwen-turbo', name: '通义千问-Turbo', vision: true },
      { id: 'qwen-coder-plus', name: '通义千问-Coder Plus', vision: false },
    ],
    doc: 'https://help.aliyun.com/zh/model-studio/developer-reference',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
  },
  {
    id: 'kimi-free-trial',
    name: 'Kimi Priority Trial (免 Key)',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: [
      { id: 'moonshot-v1-8k', name: 'Kimi k1-8K', vision: false },
      { id: 'moonshot-v1-32k', name: 'Kimi k1-32K', vision: false },
      { id: 'moonshot-v1-128k', name: 'Kimi k1-128K', vision: false },
    ],
    doc: 'https://platform.moonshot.cn/docs/intro',
    apiKeyPlaceholder: '无需 API Key (体验版)',
    requiresApiKey: false,
    codingPlan: true,
    tokenPlan: true,
    notes: '体验通道：由后端代理提供支持，无需配置个人 API Key',
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot)',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: [
      { id: 'moonshot-v1-8k', name: 'Kimi k1-8K', vision: false },
      { id: 'moonshot-v1-32k', name: 'Kimi k1-32K', vision: false },
      { id: 'moonshot-v1-128k', name: 'Kimi k1-128K', vision: false },
    ],
    doc: 'https://platform.moonshot.cn/docs/intro',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
  },
  {
    id: 'volcengine',
    name: '火山引擎',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-128k',
    models: [
      { id: 'doubao-pro-128k', name: 'Doubao-pro-128k', vision: true },
      { id: 'doubao-lite-128k', name: 'Doubao-lite-128k', vision: true },
      { id: 'deepseek-r1-250120', name: 'DeepSeek-R1 (火山)', vision: false },
      { id: 'deepseek-v3-250120', name: 'DeepSeek-V3 (火山)', vision: false },
    ],
    doc: 'https://www.volcengine.com/docs/82379/1263482',
    apiKeyPlaceholder: '...',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    apiType: 'anthropic-compatible',
    region: 'china',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-M2.7',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7', vision: false },
    ],
    doc: 'https://platform.minimaxi.com/docs/token-plan/quickstart',
    apiKeyPlaceholder: 'Token Plan Key',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
    notes: 'Token Plan 使用 Anthropic 兼容端点 (/anthropic)，模型固定为 MiniMax-M2.7',
  },
  {
    id: 'mimo',
    name: 'MiMo Token Plan',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    models: [
      { id: 'mimo-v2.5-pro', name: 'MiMo v2.5 Pro', vision: false },
    ],
    doc: 'https://docs.mimo.com/',
    apiKeyPlaceholder: 'tp-...',
    requiresApiKey: true,
    codingPlan: true,
    tokenPlan: true,
    authType: 'api-key',
    notes: '使用 api-key 头部认证（非 Bearer），OpenAI 兼容协议',
  },
  {
    id: 'stepfun',
    name: '阶跃星辰 (StepFun)',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://api.stepfun.com/v1',
    defaultModel: 'step-3.7-flash',
    models: [
      { id: 'step-3.7-flash', name: 'Step-3.7-flash', vision: false },
    ],
    doc: 'https://platform.stepfun.com',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM)',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4',
    models: [
      { id: 'glm-4', name: 'GLM-4', vision: true },
      { id: 'glm-4-flash', name: 'GLM-4-Flash', vision: true },
      { id: 'glm-4-air', name: 'GLM-4-Air', vision: true },
    ],
    doc: 'https://open.bigmodel.cn/dev/api',
    apiKeyPlaceholder: '...',
    requiresApiKey: true,
  },
  {
    id: 'qwen',
    name: '通义千问',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    models: [
      { id: 'qwen-max', name: '通义千问-Max', vision: true },
      { id: 'qwen-plus', name: '通义千问-Plus', vision: true },
      { id: 'qwen-turbo', name: '通义千问-Turbo', vision: true },
    ],
    doc: 'https://help.aliyun.com/zh/model-studio/developer-reference',
    apiKeyPlaceholder: 'sk-...',
    requiresApiKey: true,
  },
  {
    id: 'doubao',
    name: 'Doubao',
    apiType: 'openai-compatible',
    region: 'china',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-128k',
    models: [
      { id: 'doubao-pro-128k', name: 'Doubao-pro-128k', vision: true },
      { id: 'doubao-lite-128k', name: 'Doubao-lite-128k', vision: true },
    ],
    doc: 'https://www.volcengine.com/docs/82379/1263482',
    apiKeyPlaceholder: '...',
    requiresApiKey: true,
  },
];

// ==================== 工具函数 ====================

/**
 * 规范化 Base URL
 * - 去除末尾斜杠
 * - 如果缺失 /v1，自动补上
 * - 如果已经是完整 endpoint（如 .../v1/chat/completions 或 .../v1/messages），保留原样
 * @param {string} url
 * @returns {string}
 */
export function normalizeBaseUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let normalized = url.trim().replace(/\/+$/, '');
  if (!normalized) return '';

  // 如果已经是完整 endpoint，不再修改
  if (/(\/v\d+\/chat\/completions|\/v\d+\/messages)$/.test(normalized)) {
    return normalized;
  }

  // 如果末尾是 /vN，已经是版本号结尾，视为已规范化
  if (/\/v\d+$/.test(normalized)) {
    return normalized;
  }

  // 如果包含 /vN/ 但后面还有路径，保留原样（用户可能指向特定路径）
  if (/\/v\d+\//.test(normalized)) {
    return normalized;
  }

  // 否则补上 /v1
  return `${normalized}/v1`;
}

/**
 * 根据 preset id 查找预设
 * @param {string} id
 * @returns {Object|null}
 */
export function findPresetById(id) {
  return PROVIDER_PRESETS.find((p) => p.id === id) || null;
}

/**
 * 获取所有 preset 选项（用于下拉选择）
 * @returns {Array<{id, name, region}>}
 */
export function getPresetOptions() {
  return PROVIDER_PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
  }));
}

/**
 * 获取指定 preset 的模型列表
 * @param {string} presetId
 * @returns {Array<{id, name, vision}>}
 */
export function getModelsForPreset(presetId) {
  const preset = findPresetById(presetId);
  if (!preset) return [];
  return preset.models.map((m) => ({
    id: m.id,
    name: m.name,
    vision: !!m.vision,
  }));
}

/**
 * 判断指定 preset + model 是否支持 vision
 * @param {string} presetId
 * @param {string} modelId
 * @returns {boolean}
 */
export function isVisionCapable(presetId, modelId) {
  if (!presetId || !modelId) return true; // 默认保守：假设支持
  const preset = findPresetById(presetId);
  if (!preset) return true;
  const model = preset.models.find(
    (m) => m.id === modelId || m.name === modelId
  );
  if (!model) return true;
  return !!model.vision;
}

/**
 * 解析 apiType
 * @param {Object} presetOrConfig - preset 对象或配置对象
 * @returns {string} 'openai-compatible' | 'anthropic-compatible'
 */
export function resolveApiType(presetOrConfig) {
  if (!presetOrConfig) return 'openai-compatible';
  if (presetOrConfig.apiType) return presetOrConfig.apiType;
  // 兼容旧格式 apiFormats
  if (Array.isArray(presetOrConfig.apiFormats)) {
    if (presetOrConfig.apiFormats.includes('anthropic')) return 'anthropic-compatible';
    if (presetOrConfig.apiFormats.includes('openai')) return 'openai-compatible';
  }
  return 'openai-compatible';
}

// ==================== 向后兼容：旧格式导出 ====================

/**
 * 将新 ProviderPreset 格式转换为旧 MODEL_PRESETS 格式
 */
function transformToOldFormat(preset) {
  return {
    provider: preset.name,
    providerKey: preset.id,
    apiFormats: preset.apiType === 'anthropic-compatible' ? ['anthropic'] : ['openai'],
    baseUrl: preset.baseUrl,
    authType: preset.authType || 'bearer',
    models: preset.models.map((m) => ({
      id: m.id,
      name: m.name,
      vision: !!m.vision,
      codingPlan: !!preset.codingPlan,
      tokenPlan: !!preset.tokenPlan,
    })),
    docs: preset.doc ? { api: preset.doc } : {},
    notes: preset.notes || '',
    requiresApiKey: preset.requiresApiKey !== false,
  };
}

/** 旧格式 MODEL_PRESETS（保持向后兼容） */
export const MODEL_PRESETS = PROVIDER_PRESETS.map(transformToOldFormat);

// ==================== 向后兼容：旧工具函数 ====================

/**
 * 根据 providerKey 查找预设（旧接口）
 * @param {string} providerKey
 * @returns {Object|null}
 */
export function findPreset(providerKey) {
  const preset = findPresetById(providerKey);
  return preset ? transformToOldFormat(preset) : null;
}

/**
 * 获取所有提供商列表（旧接口）
 * @returns {Array<{key, label}>}
 */
export function getProviderOptions() {
  return MODEL_PRESETS.map((p) => ({
    key: p.providerKey,
    label: p.provider,
  }));
}

/**
 * 获取指定提供商的模型列表（旧接口）
 * @param {string} providerKey
 * @returns {Array<{id, name, vision}>}
 */
export function getModelOptions(providerKey) {
  const preset = findPreset(providerKey);
  if (!preset) return [];
  return preset.models.map((m) => ({
    id: m.id,
    name: m.name,
    vision: m.vision,
  }));
}

/**
 * 判断指定模型是否支持 vision（旧接口，按模型名称全局搜索）
 * @param {string} modelName
 * @returns {boolean}
 */
export function isVisionCapableByModelName(modelName) {
  if (!modelName) return true;
  const name = String(modelName).toLowerCase();
  for (const preset of PROVIDER_PRESETS) {
    for (const model of preset.models) {
      if (model.id.toLowerCase() === name || model.name.toLowerCase() === name) {
        return !!model.vision;
      }
    }
  }
  return true;
}
