import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getModelConfigs, saveModelConfigs, getSelectedConfigId, setSelectedConfigId } from '../storage';
import { isVisionCapable } from '../modelPresets';
import { formatCustomModelLabel } from '../i18n';

/** MiniMax Token Plan 默认配置 */
const DEFAULT_MINIMAX_CONFIG = {
  id: 'preset-minimax-default',
  baseUrl: 'https://api.minimaxi.com/anthropic',
  modelName: 'MiniMax-M2.7',
  apiFormat: 'anthropic',
  apiKey: '',
};

function resolveInitialModel() {
  try {
    let configs = getModelConfigs();
    // 首次使用：自动创建 MiniMax 默认配置
    if (!Array.isArray(configs) || configs.length === 0) {
      configs = [{ ...DEFAULT_MINIMAX_CONFIG }];
      saveModelConfigs(configs);
      setSelectedConfigId(DEFAULT_MINIMAX_CONFIG.id);
      return {
        key: 'custom',
        label: formatCustomModelLabel(DEFAULT_MINIMAX_CONFIG.modelName),
        configId: DEFAULT_MINIMAX_CONFIG.id,
        config: DEFAULT_MINIMAX_CONFIG,
      };
    }
    const selectedId = getSelectedConfigId();
    const cfg = selectedId
      ? configs.find((c) => c.id === selectedId)
      : configs[0];
    if (cfg) {
      return {
        key: 'custom',
        label: formatCustomModelLabel(cfg.modelName || cfg.name),
        configId: cfg.id,
        config: {
          ...cfg,
          baseUrl: cfg.baseUrl || cfg.baseURL || '',
        },
      };
    }
  } catch (_) {
    /* ignore */
  }
  return {
    key: 'custom',
    label: 'Custom Model',
    configId: null,
    config: null,
  };
}

function resolveInitialVisionCapable() {
  const initialModel = resolveInitialModel();
  return initialModel?.config?.modelName
    ? isVisionCapable(initialModel.config.modelName)
    : true;
}

export const useModelStore = create(
  persist(
    (set, get) => ({
      // State
      selectedModel: resolveInitialModel(),
      modelConfigs: [],
      selectedConfigId: null,
      visionCapable: resolveInitialVisionCapable(),

      // Actions - setters
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      setModelConfigs: (modelConfigs) => set({ modelConfigs }),
      setSelectedConfigId: (selectedConfigId) => set({ selectedConfigId }),
      setVisionCapable: (visionCapable) => set({ visionCapable }),

      // Actions - computed / helpers
      selectModel: (model) => {
        const visionCapable = model?.config?.modelName
          ? isVisionCapable(model.config.modelName)
          : true;
        set({ selectedModel: model, visionCapable });
      },

      getCurrentModelName: () => {
        return get().selectedModel?.config?.modelName || '';
      },

      getCurrentModelLabel: () => {
        return get().selectedModel?.label || 'Custom Model';
      },

      isCurrentModelVisionCapable: () => {
        const modelName = get().selectedModel?.config?.modelName;
        return modelName ? isVisionCapable(modelName) : true;
      },

      hasValidConfig: () => {
        return !!get().selectedModel?.config;
      },
    }),
    {
      name: 'ai-chat-model-store',
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        selectedConfigId: state.selectedConfigId,
      }),
    }
  )
);
