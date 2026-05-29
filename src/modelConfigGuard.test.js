import { describe, expect, it } from 'vitest';
import { validateRunnableModelConfig } from './modelConfigGuard';

describe('validateRunnableModelConfig', () => {
    it('returns missing_config when no config is selected', () => {
        expect(validateRunnableModelConfig(null)).toEqual({
            ok: false,
            code: 'missing_config',
            message: expect.any(String),
        });
    });

    it('returns missing_api_key when the selected config has no API key', () => {
        const result = validateRunnableModelConfig({
            baseUrl: 'https://api.example.com/anthropic',
            modelName: 'claude-3-5-sonnet-latest',
            apiFormat: 'anthropic',
            apiKey: '   ',
        });

        expect(result).toEqual({
            ok: false,
            code: 'missing_api_key',
            message: expect.any(String),
        });
        expect(result.message).not.toContain('https://api.example.com/anthropic');
        expect(result.message).not.toContain('claude-3-5-sonnet-latest');
    });

    it('returns missing_base_url when the selected config has no base URL', () => {
        expect(validateRunnableModelConfig({
            apiKey: 'sk-ant-test-key',
            modelName: 'claude-3-5-sonnet-latest',
            apiFormat: 'anthropic',
        })).toEqual({
            ok: false,
            code: 'missing_base_url',
            message: expect.any(String),
        });
    });

    it('returns missing_model when the selected config has no model name', () => {
        expect(validateRunnableModelConfig({
            baseUrl: 'https://api.anthropic.com',
            apiKey: 'sk-ant-test-key',
            apiFormat: 'anthropic',
        })).toEqual({
            ok: false,
            code: 'missing_model',
            message: expect.any(String),
        });
    });

    it('returns a normalized config when an Anthropic-compatible config is runnable', () => {
        expect(validateRunnableModelConfig({
            baseURL: ' https://api.anthropic.com ',
            apiKey: 'sk-ant-test-key',
            modelName: 'claude-3-5-sonnet-latest',
            apiFormat: 'anthropic',
        })).toEqual({
            ok: true,
            config: {
                baseUrl: 'https://api.anthropic.com',
                apiKey: 'sk-ant-test-key',
                model: 'claude-3-5-sonnet-latest',
                modelName: 'claude-3-5-sonnet-latest',
                apiFormat: 'anthropic',
                apiType: 'anthropic-compatible',
            },
        });
    });

    it('bypasses API key validation when requiresApiKey is false', () => {
        expect(validateRunnableModelConfig({
            baseUrl: 'https://api.moonshot.cn/v1',
            modelName: 'moonshot-v1-8k',
            apiFormat: 'openai',
            apiKey: '',
            requiresApiKey: false,
        })).toEqual({
            ok: true,
            config: {
                baseUrl: 'https://api.moonshot.cn/v1',
                apiKey: '',
                model: 'moonshot-v1-8k',
                modelName: 'moonshot-v1-8k',
                apiFormat: 'openai',
                apiType: 'openai-compatible',
            },
        });
    });

    it('bypasses API key validation for Kimi Priority Trial presets', () => {
        expect(validateRunnableModelConfig({
            id: 'preset-kimi-free-trial',
            baseUrl: 'https://api.moonshot.cn/v1',
            modelName: 'moonshot-v1-8k',
            apiFormat: 'openai',
            apiKey: '  ',
        })).toEqual({
            ok: true,
            config: {
                baseUrl: 'https://api.moonshot.cn/v1',
                apiKey: '',
                model: 'moonshot-v1-8k',
                modelName: 'moonshot-v1-8k',
                apiFormat: 'openai',
                apiType: 'openai-compatible',
            },
        });
    });
});
