import { describe, expect, it } from 'vitest';

import { findPreset } from './modelPresets';

describe('model provider presets', () => {
  it('keeps MiMo Token Plan on the Anthropic-compatible endpoint', () => {
    const preset = findPreset('mimo');

    expect(preset).toMatchObject({
      providerKey: 'mimo',
      apiFormats: ['anthropic'],
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      authType: 'bearer',
      requiresApiKey: true,
    });
    expect(preset.models[0].id).toBe('mimo-v2.5-pro');
  });
});
