import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  assertSafeModelSeedTarget,
  buildSeedModelConfig,
  buildModelStorageState,
  isLocalSeedTarget,
} = require('../scripts/modelConfigSeed.cjs');

describe('model config seed helper', () => {
  it('builds a no-key local test config by default', () => {
    const config = buildSeedModelConfig({});

    expect(config).toMatchObject({
      id: 'preset-kimi-free-trial',
      baseUrl: 'https://api.moonshot.cn/v1',
      modelName: 'moonshot-v1-8k',
      apiFormat: 'openai',
      apiKey: '',
      requiresApiKey: false,
    });
  });

  it('builds a provider config from explicit QA environment variables', () => {
    const config = buildSeedModelConfig({
      VIBEREADER_TEST_MODEL_ID: 'qa-moonshot',
      VIBEREADER_TEST_BASE_URL: 'https://api.moonshot.cn/v1',
      VIBEREADER_TEST_API_KEY: 'local-secret',
      VIBEREADER_TEST_MODEL: 'moonshot-v1-32k',
      VIBEREADER_TEST_API_FORMAT: 'openai',
    });

    expect(config).toMatchObject({
      id: 'qa-moonshot',
      baseUrl: 'https://api.moonshot.cn/v1',
      apiKey: 'local-secret',
      modelName: 'moonshot-v1-32k',
      apiFormat: 'openai',
      requiresApiKey: true,
    });
  });

  it('builds a StepFun config from local provider environment variables', () => {
    const config = buildSeedModelConfig({
      STEPFUN_API_KEY: 'step-secret',
      STEPFUN_BASE_URL: 'https://api.stepfun.com/v1',
      STEPFUN_MODEL: 'step-3.7-flash',
    });

    expect(config).toMatchObject({
      id: 'qa-env-stepfun',
      baseUrl: 'https://api.stepfun.com/v1',
      apiKey: 'step-secret',
      modelName: 'step-3.7-flash',
      apiFormat: 'openai',
      requiresApiKey: true,
    });
  });

  it('builds a MiMo Token Plan config with Anthropic protocol', () => {
    const config = buildSeedModelConfig({
      MIMO_API_KEY: 'mimo-secret',
      MIMO_BASE_URL: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      MIMO_MODEL: 'mimo-v2.5-pro',
    });

    expect(config).toMatchObject({
      id: 'qa-env-mimo',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      apiKey: 'mimo-secret',
      modelName: 'mimo-v2.5-pro',
      apiFormat: 'anthropic',
      requiresApiKey: true,
    });
  });

  it('uses the MiniMax Token Plan key alias and local overrides', () => {
    const config = buildSeedModelConfig({
      MINIMAX_TOKEN_PLAN_KEY: 'minimax-token-secret',
      MINIMAX_BASE_URL: 'https://api.minimaxi.com/anthropic',
      MINIMAX_MODEL: 'MiniMax-M2.7',
    });

    expect(config).toMatchObject({
      id: 'qa-env-minimax',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      apiKey: 'minimax-token-secret',
      modelName: 'MiniMax-M2.7',
      apiFormat: 'anthropic',
      requiresApiKey: true,
    });
  });

  it('writes both model config storage surfaces', () => {
    const config = buildSeedModelConfig({
      VIBEREADER_TEST_MODEL_ID: 'qa-model',
      VIBEREADER_TEST_BASE_URL: 'https://example.test/v1',
      VIBEREADER_TEST_API_KEY: 'secret',
      VIBEREADER_TEST_MODEL: 'example-model',
    });
    const entries = buildModelStorageState(config);

    expect(JSON.parse(entries['ai-chat.modelConfigs'])).toEqual([config]);
    expect(JSON.parse(entries['ai-chat.selectedConfigId'])).toBe('qa-model');
    expect(JSON.parse(entries['ai-chat-model-store'])).toMatchObject({
      state: {
        selectedModel: {
          key: 'custom',
          label: 'Custom model (example-model)',
          configId: 'qa-model',
          config,
        },
        selectedConfigId: 'qa-model',
      },
    });
  });

  it('allows model seeding only into local targets by default', () => {
    expect(isLocalSeedTarget('http://127.0.0.1:3217/')).toBe(true);
    expect(isLocalSeedTarget('http://localhost:3217/')).toBe(true);
    expect(isLocalSeedTarget('https://example.com/')).toBe(false);

    expect(() => assertSafeModelSeedTarget('https://example.com/', {})).toThrow(/Refusing to seed/);
    expect(() => assertSafeModelSeedTarget('https://example.com/', {
      ALLOW_REMOTE_MODEL_SEED: '1',
    })).not.toThrow();
  });
});
