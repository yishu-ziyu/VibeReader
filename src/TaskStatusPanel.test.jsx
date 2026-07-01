import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskStatusPanel } from './TaskStatusPanel';

const persistentMock = vi.hoisted(() => ({
  listPersistentTasks: vi.fn(async () => []),
  TASK_UPDATED_EVENT: 'vibereader:task-updated',
}));

vi.mock('./services/persistentStorage', () => persistentMock);

describe('TaskStatusPanel', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    persistentMock.listPersistentTasks.mockReset();
    persistentMock.listPersistentTasks.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('lists current document tasks with status, progress, and failure reason', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-memory',
        documentId: 'doc-1',
        type: 'saved_memory_ingest',
        status: 'running',
        title: '记忆沉淀',
        progress: 42,
        updatedAt: 3000,
      },
      {
        id: 'task-summary',
        documentId: 'doc-1',
        type: 'section_summary',
        status: 'succeeded',
        title: 'Summarize Introduction',
        progress: 100,
        updatedAt: 2000,
      },
      {
        id: 'task-attention',
        documentId: 'doc-1',
        type: 'attention_analysis',
        status: 'failed',
        title: 'Find key locations',
        progress: 100,
        errorMessage: 'model timeout',
        updatedAt: 1000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    expect((await screen.findAllByText('记忆沉淀')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Summarize Introduction')).toBeTruthy();
    expect(screen.getByText('Find key locations')).toBeTruthy();
    expect(screen.getByText('运行中')).toBeTruthy();
    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByText('失败')).toBeTruthy();
    expect(screen.getAllByRole('progressbar').map((item) => item.getAttribute('aria-valuenow'))).toEqual([
      '42',
      '100',
      '100',
    ]);
    expect(screen.getByText('model timeout')).toBeTruthy();
    expect(persistentMock.listPersistentTasks).toHaveBeenCalledWith('doc-1');
  });

  it('shows a bounded result preview for a succeeded agent task', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-overview',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'succeeded',
        title: 'Paper overview',
        progress: 100,
        result: {
          content: `# Paper overview\n\n${'Important source-backed finding. '.repeat(20)}`,
        },
        updatedAt: 5000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    expect((await screen.findAllByText('论文总览')).length).toBeGreaterThan(0);
    const preview = document.querySelector('.task-status-result');
    expect(preview?.textContent).toContain('Important source-backed finding.');
    expect(preview?.textContent).toContain('...');
    expect(preview?.textContent.length).toBeLessThan(260);
  });

  it('does not render an empty result preview when task content is missing', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-empty-result',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'succeeded',
        title: 'Paper overview',
        progress: 100,
        result: {},
        updatedAt: 5000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    expect((await screen.findAllByText('论文总览')).length).toBeGreaterThan(0);
    expect(document.querySelector('.task-status-result')).toBeNull();
  });

  it('requests saving a succeeded task result to Notes', async () => {
    const onSaveTaskResult = vi.fn();
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-overview',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'succeeded',
        title: 'Paper overview',
        progress: 100,
        result: {
          content: '# Paper overview\n\nImportant source-backed finding.',
        },
        updatedAt: 5000,
      },
    ]);

    render(
      <TaskStatusPanel
        documentId="doc-1"
        onSaveTaskResult={onSaveTaskResult}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '保存到笔记' }));

    expect(onSaveTaskResult).toHaveBeenCalledTimes(1);
    expect(onSaveTaskResult).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-agent-overview',
      documentId: 'doc-1',
      type: 'paper_overview_agent',
      status: 'succeeded',
    }));
  });

  it('does not show Save to Notes when task result content is missing', async () => {
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-empty-result',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'succeeded',
        title: 'Paper overview',
        progress: 100,
        result: {},
        updatedAt: 5000,
      },
    ]);

    render(
      <TaskStatusPanel
        documentId="doc-1"
        onSaveTaskResult={vi.fn()}
      />
    );

    expect((await screen.findAllByText('论文总览')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '保存到笔记' })).toBeNull();
  });

  it('renders an empty state when no document tasks are available', async () => {
    render(<TaskStatusPanel documentId="doc-empty" />);

    expect(await screen.findByText('暂无阅读任务')).toBeTruthy();
  });

  it('starts a paper overview agent for the current document', async () => {
    const onStartAgentTask = vi.fn();

    render(
      <TaskStatusPanel
        documentId="doc-1"
        onStartAgentTask={onStartAgentTask}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '论文总览' }));

    expect(onStartAgentTask).toHaveBeenCalledTimes(1);
    expect(onStartAgentTask).toHaveBeenCalledWith('paper_overview_agent');
  });

  it('starts configured reading agent skills for the current document', async () => {
    const onStartAgentTask = vi.fn();

    render(
      <TaskStatusPanel
        documentId="doc-1"
        agentSkills={[
          { type: 'paper_overview_agent', title: 'Paper overview' },
          { type: 'attention_agent', title: 'Attention route' },
          { type: 'card_generation_agent', title: 'Create VibeCard' },
        ]}
        onStartAgentTask={onStartAgentTask}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '生成卡片' }));

    expect(onStartAgentTask).toHaveBeenCalledTimes(1);
    expect(onStartAgentTask).toHaveBeenCalledWith('card_generation_agent');
  });

  it('does not show the paper overview entry without a current document', () => {
    render(<TaskStatusPanel onStartAgentTask={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '论文总览' })).toBeNull();
  });

  it('refreshes current document tasks when a task update event is emitted', async () => {
    persistentMock.listPersistentTasks
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'task-live',
          documentId: 'doc-1',
          type: 'section_summary',
          status: 'running',
          title: 'Live summary',
          progress: 30,
          updatedAt: 3000,
        },
      ]);

    render(<TaskStatusPanel documentId="doc-1" />);

    expect(await screen.findByText('暂无阅读任务')).toBeTruthy();

    window.dispatchEvent(new CustomEvent('vibereader:task-updated', {
      detail: {
        documentId: 'doc-1',
        task: {
          id: 'task-live',
          documentId: 'doc-1',
        },
      },
    }));

    expect(await screen.findByText('Live summary')).toBeTruthy();
    expect(screen.getByText('运行中')).toBeTruthy();
    expect(persistentMock.listPersistentTasks).toHaveBeenCalledTimes(2);
    expect(persistentMock.listPersistentTasks).toHaveBeenLastCalledWith('doc-1');
  });

  it('ignores task update events for other documents', async () => {
    render(<TaskStatusPanel documentId="doc-1" />);

    expect(await screen.findByText('暂无阅读任务')).toBeTruthy();

    window.dispatchEvent(new CustomEvent('vibereader:task-updated', {
      detail: {
        documentId: 'doc-2',
        task: {
          id: 'task-other',
          documentId: 'doc-2',
        },
      },
    }));

    expect(persistentMock.listPersistentTasks).toHaveBeenCalledTimes(1);
  });

  it('requests retry for a failed source index task', async () => {
    const onRetryTask = vi.fn();
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-source-index-doc-1',
        documentId: 'doc-1',
        type: 'source_index',
        status: 'failed',
        title: 'Index Paper.pdf',
        progress: 100,
        errorMessage: 'disk full',
        updatedAt: 4000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" onRetryTask={onRetryTask} />);

    fireEvent.click(await screen.findByRole('button', { name: '重试' }));

    expect(onRetryTask).toHaveBeenCalledTimes(1);
    expect(onRetryTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-source-index-doc-1',
      documentId: 'doc-1',
      type: 'source_index',
      status: 'failed',
    }));
  });

  it('requests retry for a failed agent task', async () => {
    const onRetryTask = vi.fn();
    persistentMock.listPersistentTasks.mockResolvedValue([
      {
        id: 'task-agent-doc-1',
        documentId: 'doc-1',
        type: 'paper_overview_agent',
        status: 'failed',
        title: 'Paper overview',
        progress: 100,
        errorMessage: 'permission denied',
        payloadJson: JSON.stringify({
          agentOptions: {
            goal: 'Summarize this paper.',
          },
        }),
        updatedAt: 5000,
      },
    ]);

    render(<TaskStatusPanel documentId="doc-1" onRetryTask={onRetryTask} />);

    fireEvent.click(await screen.findByRole('button', { name: '重试' }));

    expect(onRetryTask).toHaveBeenCalledTimes(1);
    expect(onRetryTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-agent-doc-1',
      documentId: 'doc-1',
      type: 'paper_overview_agent',
      status: 'failed',
    }));
  });
});
