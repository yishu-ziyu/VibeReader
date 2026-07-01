import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, List, Progress, Spin, Tag } from 'antd';
import { ClockCircleOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { listPersistentTasks, TASK_UPDATED_EVENT } from './services/persistentStorage';

const STATUS_COLORS = {
  pending: 'default',
  running: 'processing',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'warning',
};

const KNOWN_TASK_TITLE_LABELS = {
  'Paper overview': '论文总览',
  'Attention route': '阅读路线',
  'Create VibeCard': '生成卡片',
  'Note export': '导出笔记',
};

function taskTypeLabel(type = '') {
  switch (type) {
    case 'source_index':
      return '文档索引';
    case 'knowledge_ingest':
      return '知识入库';
    case 'saved_memory_ingest':
      return '记忆沉淀';
    case 'section_summary':
      return '章节摘要';
    case 'attention_analysis':
      return '注意力路线';
    case 'paper_overview_agent':
      return '论文总览';
    case 'attention_agent':
      return '阅读路线';
    case 'card_generation_agent':
      return '生成卡片';
    case 'note_export_agent':
      return '导出笔记';
    default:
      return type || '任务';
  }
}

function taskStatusLabel(status = '') {
  switch (status) {
    case 'pending':
      return '等待中';
    case 'running':
      return '运行中';
    case 'succeeded':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    default:
      return status || '等待中';
  }
}

function agentSkillLabel(skill = {}) {
  if (skill.type) return taskTypeLabel(skill.type);
  return skill.title || '任务';
}

function taskTitleLabel(task = {}) {
  if (task.title && KNOWN_TASK_TITLE_LABELS[task.title]) return KNOWN_TASK_TITLE_LABELS[task.title];
  return task.title || taskTypeLabel(task.type);
}

function sortTasks(tasks = []) {
  return [...tasks].sort(
    (left, right) =>
      Number(right.updatedAt || right.updated_at || 0) - Number(left.updatedAt || left.updated_at || 0)
  );
}

function canRetryTask(task = {}) {
  const statusRetryable = ['failed', 'cancelled'].includes(task.status);
  const type = String(task.type || '');
  return statusRetryable && (type === 'source_index' || type === 'knowledge_ingest' || type.endsWith('_agent'));
}

function taskResultText(task = {}) {
  const result = task.result && typeof task.result === 'object' ? task.result : {};
  return String(result.content || result.summary || result.text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function boundedTaskResultText(task = {}, maxLength = 220) {
  const text = taskResultText(task);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function canSaveTaskResult(task = {}) {
  return task.status === 'succeeded' && !!taskResultText(task);
}

const DEFAULT_AGENT_SKILLS = Object.freeze([
  Object.freeze({ type: 'paper_overview_agent', title: '论文总览' }),
]);

function visibleAgentSkills(agentSkills) {
  const skills = Array.isArray(agentSkills) && agentSkills.length > 0
    ? agentSkills
    : DEFAULT_AGENT_SKILLS;
  return skills.filter((skill) => skill?.type && skill?.title);
}

export function TaskStatusPanel({
  documentId,
  agentSkills,
  compact = false,
  onRetryTask,
  onStartAgentTask,
  onSaveTaskResult,
  style = {},
}) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTasks([]);

    if (!documentId) return () => {
      cancelled = true;
    };

    const loadTasks = ({ showLoading = true } = {}) => {
      if (showLoading) setLoading(true);
      return listPersistentTasks(documentId)
        .then((items) => {
          if (cancelled) return;
          setTasks(Array.isArray(items) ? items : []);
        })
        .catch((error) => {
          console.warn('[TaskStatusPanel] Failed to load tasks:', error);
          if (!cancelled) setTasks([]);
        })
        .finally(() => {
          if (!cancelled && showLoading) setLoading(false);
        });
    };

    loadTasks();

    const handleTaskUpdated = (event) => {
      const updatedDocumentId = event?.detail?.documentId || event?.detail?.task?.documentId || null;
      if (updatedDocumentId !== documentId) return;
      loadTasks({ showLoading: false });
    };

    window.addEventListener(TASK_UPDATED_EVENT, handleTaskUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener(TASK_UPDATED_EVENT, handleTaskUpdated);
    };
  }, [documentId]);

  const visibleTasks = useMemo(() => sortTasks(tasks), [tasks]);

  return (
    <div className={`task-status-panel${compact ? ' task-status-panel-compact' : ''}`} style={style}>
      <div className="task-status-header">
        <div className="task-status-title">
          <ClockCircleOutlined />
          <span>{compact ? '精读进度' : '阅读任务'}</span>
        </div>
        {documentId && typeof onStartAgentTask === 'function' && (
          <div className="task-status-agent-actions">
            {visibleAgentSkills(agentSkills).map((skill) => (
              <Button
                aria-label={agentSkillLabel(skill)}
                icon={<ThunderboltOutlined />}
                key={skill.type}
                size="small"
                type={skill.type === 'paper_overview_agent' ? 'primary' : 'default'}
                onClick={() => onStartAgentTask(skill.type)}
              >
                {agentSkillLabel(skill)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="task-status-empty">
          <Spin size="small" />
        </div>
      )}

      {!loading && visibleTasks.length === 0 && (
        <div className="task-status-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={compact ? '精读流程尚未启动' : '暂无阅读任务'}
          />
        </div>
      )}

      {!loading && visibleTasks.length > 0 && (
        <List
          className="task-status-list"
          size="small"
          dataSource={visibleTasks}
          renderItem={(task) => {
            const resultPreview = boundedTaskResultText(task);
            return (
              <List.Item className="task-status-item">
                <div className="task-status-item-main">
                  <div className="task-status-item-topline">
                    <span className="task-status-item-title">
                      {taskTitleLabel(task)}
                    </span>
                    <Tag color={STATUS_COLORS[task.status] || 'default'}>
                      {taskStatusLabel(task.status)}
                    </Tag>
                  </div>
                  <div className="task-status-item-meta">
                    {taskTypeLabel(task.type)}
                  </div>
                  <Progress
                    size="small"
                    percent={Math.max(0, Math.min(100, Number(task.progress || 0)))}
                    showInfo
                  />
                  {resultPreview && (
                    <div className="task-status-result">
                      {resultPreview}
                    </div>
                  )}
                  {task.errorMessage && (
                    <div className="task-status-error">
                      {task.errorMessage}
                    </div>
                  )}
                  {canRetryTask(task) && typeof onRetryTask === 'function' && (
                    <div className="task-status-actions">
                      <Button
                        size="small"
                        type="link"
                        onClick={() => onRetryTask(task)}
                      >
                        重试
                      </Button>
                    </div>
                  )}
                  {canSaveTaskResult(task) && typeof onSaveTaskResult === 'function' && (
                    <div className="task-status-actions">
                      <Button
                        aria-label="保存到笔记"
                        icon={<SaveOutlined />}
                        size="small"
                        type="link"
                        onClick={() => onSaveTaskResult(task)}
                      >
                        保存到笔记
                      </Button>
                    </div>
                  )}
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}

export default TaskStatusPanel;
