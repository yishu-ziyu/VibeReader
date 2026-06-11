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

function taskTypeLabel(type = '') {
  switch (type) {
    case 'source_index':
      return 'Source index';
    case 'section_summary':
      return 'Summary';
    case 'attention_analysis':
      return 'Attention';
    default:
      return type || 'Task';
  }
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
  return statusRetryable && (type === 'source_index' || type.endsWith('_agent'));
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
  Object.freeze({ type: 'paper_overview_agent', title: 'Paper overview' }),
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
    <div className="task-status-panel" style={style}>
      <div className="task-status-header">
        <div className="task-status-title">
          <ClockCircleOutlined />
          <span>Reading Tasks</span>
        </div>
        {documentId && typeof onStartAgentTask === 'function' && (
          <div className="task-status-agent-actions">
            {visibleAgentSkills(agentSkills).map((skill) => (
              <Button
                aria-label={skill.title}
                icon={<ThunderboltOutlined />}
                key={skill.type}
                size="small"
                type={skill.type === 'paper_overview_agent' ? 'primary' : 'default'}
                onClick={() => onStartAgentTask(skill.type)}
              >
                {skill.title}
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
            description="No reading tasks yet"
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
                      {task.title || taskTypeLabel(task.type)}
                    </span>
                    <Tag color={STATUS_COLORS[task.status] || 'default'}>
                      {task.status || 'pending'}
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
                        Retry
                      </Button>
                    </div>
                  )}
                  {canSaveTaskResult(task) && typeof onSaveTaskResult === 'function' && (
                    <div className="task-status-actions">
                      <Button
                        aria-label="Save to Notes"
                        icon={<SaveOutlined />}
                        size="small"
                        type="link"
                        onClick={() => onSaveTaskResult(task)}
                      >
                        Save to Notes
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
