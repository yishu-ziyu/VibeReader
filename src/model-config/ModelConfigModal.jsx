/**
 * Model configuration modal — standalone component.
 * Extracted from ChatInput.jsx. Manages AI provider configs.
 */
import { useState, useCallback, useMemo } from 'react';
import { Modal, Button, Form, Input, Select, Flex, message } from 'antd';
import {
    DeleteOutlined, PlusOutlined, CheckOutlined, CloseOutlined,
    ExportOutlined, ImportOutlined, ThunderboltOutlined, EyeOutlined,
    CodeOutlined, ExpandOutlined, LinkOutlined,
} from '@ant-design/icons';
import {
    findPreset, getProviderOptions, getModelOptions, normalizeBaseUrl,
    isVisionCapable, PROVIDER_PRESETS,
} from '../modelPresets';
import { saveModelConfigs, getModelConfigs, getSelectedConfigId, setSelectedConfigId } from '../storage';

const { TextArea } = Input;

// ========== Templates ==========

const CONFIG_TEMPLATES = [
    {
        id: 'stepfun',
        label: 'StepFun 阶跃 (P0)',
        icon: '⚡',
        baseUrl: 'https://api.stepfun.com/v1',
        apiFormat: 'openai',
        modelName: 'step-3.7-flash',
        providerKey: 'stepfun',
        description: 'P0 主链路：reasoning + JSON + 多 Agent',
    },
    {
        id: 'deepseek-v4',
        label: 'DeepSeek V4 Flash',
        icon: '🧠',
        baseUrl: 'https://api.deepseek.com/v1',
        apiFormat: 'openai',
        modelName: 'deepseek-v4-flash',
        providerKey: 'deepseek',
        description: '低成本中文推理',
    },
    {
        id: 'minimax',
        label: 'MiniMax Token Plan',
        icon: '💎',
        baseUrl: 'https://api.minimaxi.com/anthropic',
        apiFormat: 'anthropic',
        modelName: 'MiniMax-M3',
        providerKey: 'minimax',
        description: 'Token Plan，Coding 强',
    },
    {
        id: 'kimi-free',
        label: 'Kimi 免费体验',
        icon: '🌙',
        baseUrl: 'https://api.moonshot.cn/v1',
        apiFormat: 'openai',
        modelName: 'moonshot-v1-8k',
        providerKey: 'kimi-free-trial',
        requiresApiKey: false,
        description: '免 Key，快速试用',
    },
    {
        id: 'mimo',
        label: 'MiMo v2.5 Pro',
        icon: '🔮',
        baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        apiFormat: 'anthropic',
        modelName: 'mimo-v2.5-pro',
        providerKey: 'mimo',
        description: 'Token Plan，中文生成',
    },
];

// ========== Capability tags ==========

function CapabilityTags({ providerKey, modelId }) {
    const tags = [];
    if (isVisionCapable(providerKey, modelId)) {
        tags.push({ icon: <EyeOutlined />, label: 'Vision', color: '#2B7FD8' });
    }
    const preset = providerKey ? findPreset(providerKey) : null;
    if (preset?.codingPlan) {
        tags.push({ icon: <CodeOutlined />, label: 'Coding', color: '#52c41a' });
    }
    if (preset?.tokenPlan) {
        tags.push({ icon: <ExpandOutlined />, label: '128K', color: '#722ed1' });
    }
    if (preset?.notes?.includes('免 Key')) {
        tags.push({ icon: <LinkOutlined />, label: 'No Key', color: '#faad14' });
    }
    if (!tags.length) return null;
    return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {tags.map((tag) => (
                <span key={tag.label} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: `${tag.color}15`, color: tag.color, fontWeight: 500,
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                    {tag.icon} {tag.label}
                </span>
            ))}
        </div>
    );
}

// ========== Main Modal ==========

export function ModelConfigModal({ open, onClose, onSaved }) {
    const [customConfigs, setCustomConfigs] = useState(() => getModelConfigs() || []);
    const [editingConfigId, setEditingConfigId] = useState(null);
    const [selectedPresetKey, setSelectedPresetKey] = useState(null);
    const [testing, setTesting] = useState(false);
    const [addFormFlash, setAddFormFlash] = useState(false);
    const [form] = Form.useForm();

    const syncFormFromConfig = useCallback((config) => {
        const preset = findPreset(config.providerKey || config.presetKey || '');
        setSelectedPresetKey(preset?.id || null);
        form.setFieldsValue({
            baseUrl: config.baseUrl || config.baseURL || '',
            apiKey: config.apiKey || '',
            modelName: config.modelName || config.name || '',
            apiFormat: preset ? (preset.apiType === 'anthropic-compatible' ? 'anthropic' : 'openai') : (config.apiFormat || 'openai'),
        });
    }, [form]);

    // Open modal: select existing config or reset to blank
    const handleOpenConfig = useCallback((config) => {
        if (config) {
            setEditingConfigId(config.id);
            syncFormFromConfig(config);
        } else {
            setEditingConfigId(null);
            setSelectedPresetKey(null);
            form.resetFields();
            form.setFieldsValue({ apiFormat: 'openai' });
            setAddFormFlash(true);
            requestAnimationFrame(() => {
                setAddFormFlash(false);
                window.setTimeout(() => setAddFormFlash(true), 550);
                window.setTimeout(() => setAddFormFlash(false), 1100);
            });
        }
    }, [form, syncFormFromConfig]);

    // When modal opens, refresh configs
    useState(() => {
        if (open) {
            setCustomConfigs(getModelConfigs() || []);
        }
    });

    const handlePresetChange = useCallback((providerKey) => {
        setSelectedPresetKey(providerKey);
        const preset = findPreset(providerKey);
        if (preset) {
            const model = preset.models[0];
            form.setFieldsValue({
                baseUrl: preset.baseUrl,
                modelName: model ? model.id : '',
                apiFormat: preset.apiType === 'anthropic-compatible' ? 'anthropic' : 'openai',
            });
        }
    }, [form]);

    const handlePresetModelChange = useCallback((modelId) => {
        form.setFieldsValue({ modelName: modelId });
    }, [form]);

    const handleSaveConfig = useCallback(() => {
        form.validateFields().then((values) => {
            const configs = [...customConfigs];
            const preset = findPreset(selectedPresetKey);
            const record = {
                id: editingConfigId || `custom-${Date.now()}`,
                baseUrl: normalizeBaseUrl(values.baseUrl),
                apiKey: values.apiKey || '',
                modelName: values.modelName,
                name: values.modelName,
                apiFormat: values.apiFormat || 'openai',
                providerKey: selectedPresetKey || '',
                requiresApiKey: preset ? preset.requiresApiKey !== false : true,
                authType: preset?.authType || 'bearer',
                createdAt: editingConfigId ? (configs.find(c => c.id === editingConfigId)?.createdAt || Date.now()) : Date.now(),
                updatedAt: Date.now(),
            };

            if (editingConfigId) {
                const idx = configs.findIndex(c => c.id === editingConfigId);
                if (idx >= 0) configs[idx] = record;
            } else {
                configs.unshift(record);
            }

            saveModelConfigs(configs);
            setCustomConfigs(configs);
            setSelectedConfigId(record.id);
            onSaved?.();
            message.success(editingConfigId ? '配置已更新' : '配置已添加');
        });
    }, [customConfigs, editingConfigId, selectedPresetKey, form, onSaved]);

    const handleDeleteConfig = useCallback((config) => {
        Modal.confirm({
            title: '确认删除',
            content: `删除「${config.modelName || config.name}」？`,
            okText: '删除',
            okType: 'danger',
            getContainer: document.body,
            zIndex: 10002,
            onOk: () => {
                const next = customConfigs.filter(c => c.id !== config.id);
                saveModelConfigs(next);
                setCustomConfigs(next);
                if (editingConfigId === config.id) {
                    setEditingConfigId(null);
                    form.resetFields();
                    setSelectedPresetKey(null);
                }
                message.success('配置已删除');
            },
        });
    }, [customConfigs, editingConfigId, form]);

    // Detect preset from existing config on open
    const handleOpenModal = useCallback(() => {
        const next = getModelConfigs() || [];
        setCustomConfigs(next);
        if (next.length && !editingConfigId) {
            const active = getSelectedConfigId();
            const pick = next.find(c => c.id === active) || next[0];
            handleOpenConfig(pick);
        } else if (!next.length) {
            handleOpenConfig(null);
        }
        // else: keep current editing state
    }, [editingConfigId, handleOpenConfig]);

    // Test connection
    const handleTestConnection = useCallback(async () => {
        const values = form.getFieldsValue();
        const baseUrl = normalizeBaseUrl(values.baseUrl);
        const apiKey = values.apiKey || '';
        const model = values.modelName || '';
        if (!baseUrl || !model) {
            message.warning('请先填写 Base URL 和模型名称');
            return;
        }
        setTesting(true);
        try {
            const endpoint = baseUrl.endsWith('/messages')
                ? baseUrl
                : `${baseUrl}/chat/completions`;
            const isAnthropic = (values.apiFormat || 'openai') === 'anthropic';
            const headers = {
                'Content-Type': 'application/json',
                ...(isAnthropic ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : { 'Authorization': `Bearer ${apiKey}` }),
            };
            const body = isAnthropic
                ? { model, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }
                : { model, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] };

            const start = Date.now();
            const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
            const ms = Date.now() - start;
            if (resp.ok) {
                message.success(`连接成功（${ms}ms）`);
            } else {
                const text = await resp.text().catch(() => '');
                message.error(`失败 (${resp.status}): ${text.slice(0, 80)}`);
            }
        } catch (e) {
            message.error(`连接失败: ${e.message}`);
        } finally {
            setTesting(false);
        }
    }, [form]);

    // Export
    const handleExport = useCallback(() => {
        const blob = new Blob([JSON.stringify(customConfigs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vibereader-configs-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('配置已导出');
    }, [customConfigs]);

    // Import
    const handleImport = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const imported = JSON.parse(text);
                if (!Array.isArray(imported)) throw new Error('格式错误');
                const merged = [...imported, ...customConfigs.filter(
                    c => !imported.some(i => i.id === c.id)
                )];
                saveModelConfigs(merged);
                setCustomConfigs(merged);
                message.success(`已导入 ${imported.length} 条配置`);
            } catch {
                message.error('导入失败：请选择有效的 JSON 文件');
            }
        };
        input.click();
    }, [customConfigs]);

    const providerOptions = useMemo(() => getProviderOptions(), []);
    const selectedPreset = selectedPresetKey ? findPreset(selectedPresetKey) : null;
    const presetModelOptions = selectedPreset ? getModelOptions(selectedPresetKey) : [];
    const currentConfig = editingConfigId ? customConfigs.find(c => c.id === editingConfigId) : null;

    return (
        <Modal
            title="模型配置"
            open={open}
            onCancel={onClose}
            onOk={handleSaveConfig}
            okText={editingConfigId ? '更新' : '添加'}
            cancelText="关闭"
            destroyOnHidden
            zIndex={10001}
            centered
            getContainer={document.body}
            wrapClassName="ai-chat-modal"
            width={680}
            afterOpenChange={handleOpenModal}
            styles={{ body: { maxHeight: '70vh', overflowY: 'auto', padding: 24 } }}
        >
            {/* Toolbar: import / export */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Button size="small" icon={<ImportOutlined />} onClick={handleImport}>导入</Button>
                <span style={{ fontSize: 11, color: '#999', cursor: 'help' }} title="导入 VibeReader 导出的 JSON 配置文件">?</span>
                <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
            </div>

            {/* Templates */}
            {!editingConfigId && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>快速模板</div>
                    <Flex gap="small" wrap="wrap">
                        {CONFIG_TEMPLATES.map((tpl) => (
                            <Button
                                key={tpl.id}
                                size="small"
                                onClick={() => {
                                    const preset = findPreset(tpl.providerKey);
                                    setSelectedPresetKey(preset?.id || null);
                                    form.setFieldsValue({
                                        baseUrl: tpl.baseUrl,
                                        apiKey: '',
                                        modelName: tpl.modelName,
                                        apiFormat: tpl.apiFormat,
                                    });
                                }}
                                style={{ borderRadius: 6 }}
                            >
                                {tpl.icon} {tpl.label}
                            </Button>
                        ))}
                    </Flex>
                </div>
            )}

            <Flex gap="middle" align="flex-start">
                {/* Left: config list */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 13 }}>已保存的配置</div>
                    <div style={{
                        border: '1px solid #e8e8e8', borderRadius: 6,
                        maxHeight: 260, overflowY: 'auto', background: '#fff',
                    }}>
                        {customConfigs.map((c) => (
                            <div
                                key={c.id}
                                onClick={() => handleOpenConfig(c)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '10px 12px',
                                    borderBottom: customConfigs.indexOf(c) < customConfigs.length - 1 ? '1px solid #f0f0f0' : 'none',
                                    cursor: 'pointer',
                                    background: editingConfigId === c.id ? '#e6f4ff' : '#fff',
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {c.modelName || c.name || '未命名'}
                                    </div>
                                    <CapabilityTags providerKey={c.providerKey} modelId={c.modelName} />
                                </div>
                                <Button type="text" size="small" icon={<DeleteOutlined />}
                                    onClick={(e) => { e.stopPropagation(); handleDeleteConfig(c); }}
                                    style={{ padding: '0 4px', flexShrink: 0 }}
                                />
                            </div>
                        ))}
                        {customConfigs.length === 0 && (
                            <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>
                                还没有配置，点击「+ 添加」或选择模板
                            </div>
                        )}
                    </div>
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => handleOpenConfig(null)}
                        style={{ marginTop: 8, width: '100%' }}>
                        添加新配置
                    </Button>
                </div>

                {/* Right: form */}
                <div style={{ flex: 1.5, minWidth: 0 }}>
                    {/* Preset quick-pick */}
                    <div style={{ marginBottom: 12, padding: 10, background: '#f6f6f6', borderRadius: 6 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>选择预设</div>
                        <Flex gap="small">
                            <Select
                                style={{ flex: 1 }}
                                placeholder="提供商"
                                value={selectedPresetKey}
                                onChange={handlePresetChange}
                                options={providerOptions.map(p => ({ value: p.key, label: p.label }))}
                                allowClear
                            />
                            <Select
                                style={{ flex: 1 }}
                                placeholder="模型"
                                value={form.getFieldValue('modelName')}
                                onChange={handlePresetModelChange}
                                options={presetModelOptions.map(m => ({ value: m.id, label: m.name }))}
                                disabled={!selectedPreset}
                                allowClear
                            />
                        </Flex>
                        {selectedPreset && (
                            <CapabilityTags providerKey={selectedPresetKey} modelId={form.getFieldValue('modelName')} />
                        )}
                    </div>

                    {/* Form */}
                    <Form form={form} layout="vertical">
                        <Form.Item name="apiFormat" label="API 格式" rules={[{ required: true }]}>
                            <Select options={[
                                { value: 'openai', label: 'OpenAI 格式' },
                                { value: 'anthropic', label: 'Anthropic 格式' },
                            ]} />
                        </Form.Item>
                        <Form.Item name="baseUrl" label="API Base URL" rules={[{ required: true }]}>
                            <Input placeholder="https://api.openai.com/v1" />
                        </Form.Item>
                        <Form.Item name="apiKey" label="API Key">
                            <Input.Password placeholder={selectedPreset && findPreset(selectedPresetKey)?.requiresApiKey === false ? '无需 Key' : '粘贴服务商提供的 API Key'} />
                        </Form.Item>
                        <Form.Item name="modelName" label="模型名称" rules={[{ required: true }]}>
                            <Input placeholder="如 deepseek-chat" />
                        </Form.Item>
                    </Form>

                    {/* Test connection */}
                    <Button
                        icon={<ThunderboltOutlined />}
                        onClick={handleTestConnection}
                        loading={testing}
                        size="small"
                        style={{ marginTop: 4 }}
                    >
                        测试连接
                    </Button>
                </div>
            </Flex>
        </Modal>
    );
}
