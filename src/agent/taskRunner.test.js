import { describe, expect, it, vi } from 'vitest';
import { retryReadingAgentTask, runReadingAgentTask } from './taskRunner';

describe('reading agent task runner', () => {
    it('records pending, running, and succeeded states for a completed agent run', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Overview with cited evidence.',
            trace: [],
        });

        const result = await runReadingAgentTask({
            task: {
                id: 'task-agent-1',
                documentId: 'doc-1',
                type: 'paper_overview_agent',
                title: 'Paper overview',
                payload: { goal: 'Explain the paper.' },
            },
            agentOptions: {
                goal: 'Explain the paper.',
            },
            runAgent,
            saveTask,
            now: () => 1000,
        });

        expect(runAgent).toHaveBeenCalledWith({
            goal: 'Explain the paper.',
        });
        expect(saveTask).toHaveBeenCalledTimes(3);
        expect(saveTask.mock.calls.map(([task]) => task.status)).toEqual([
            'pending',
            'running',
            'succeeded',
        ]);
        expect(saveTask.mock.calls[0][0]).toEqual(expect.objectContaining({
            id: 'task-agent-1',
            documentId: 'doc-1',
            type: 'paper_overview_agent',
            progress: 0,
            payload: {
                goal: 'Explain the paper.',
                agentOptions: {
                    goal: 'Explain the paper.',
                },
            },
        }));
        expect(saveTask.mock.calls[1][0]).toEqual(expect.objectContaining({
            status: 'running',
            progress: 10,
            startedAt: 1000,
        }));
        expect(saveTask.mock.calls[2][0]).toEqual(expect.objectContaining({
            status: 'succeeded',
            progress: 100,
            completedAt: 1000,
            result: {
                agentStatus: 'completed',
                content: 'Overview with cited evidence.',
                artifactCount: 0,
            },
        }));
        expect(result).toEqual(expect.objectContaining({
            status: 'succeeded',
            taskId: 'task-agent-1',
            agentResult: expect.objectContaining({
                status: 'completed',
            }),
        }));
    });

    it('preserves serialized retry agent options when runtime options contain functions', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Overview with local tools.',
        });
        const model = vi.fn();

        await runReadingAgentTask({
            task: {
                id: 'task-agent-serializable',
                documentId: 'doc-1',
                type: 'paper_overview_agent',
                title: 'Paper overview',
                payload: {
                    agentOptions: {
                        taskType: 'paper_overview_agent',
                        documentId: 'doc-1',
                        goal: 'Create a paper overview.',
                    },
                },
            },
            agentOptions: {
                goal: 'Create a paper overview.',
                model,
                tools: {
                    get_current_document: {
                        run: vi.fn(),
                    },
                },
            },
            runAgent,
            saveTask,
            now: () => 1500,
        });

        expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({
            goal: 'Create a paper overview.',
            model,
        }));
        expect(saveTask.mock.calls[0][0].payload).toEqual({
            agentOptions: {
                taskType: 'paper_overview_agent',
                documentId: 'doc-1',
                goal: 'Create a paper overview.',
            },
        });
    });

    it('records a failed task when the agent returns a non-completed status', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'permission_denied',
            error: 'Tool "create_vibecard" is not allowed',
            trace: [],
        });

        const result = await runReadingAgentTask({
            task: {
                id: 'task-agent-2',
                documentId: 'doc-1',
                type: 'paper_overview_agent',
                title: 'Paper overview',
            },
            runAgent,
            saveTask,
            now: () => 2000,
        });

        expect(saveTask.mock.calls.map(([task]) => task.status)).toEqual([
            'pending',
            'running',
            'failed',
        ]);
        expect(saveTask.mock.calls[2][0]).toEqual(expect.objectContaining({
            status: 'failed',
            progress: 100,
            errorMessage: 'Tool "create_vibecard" is not allowed',
            completedAt: 2000,
        }));
        expect(result).toEqual(expect.objectContaining({
            status: 'failed',
            errorMessage: 'Tool "create_vibecard" is not allowed',
        }));
    });

    it('records a failed task when the agent runner throws', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockRejectedValue(new Error('Model unavailable'));

        const result = await runReadingAgentTask({
            task: {
                id: 'task-agent-3',
                documentId: 'doc-1',
                type: 'attention_agent',
                title: 'Attention route',
            },
            runAgent,
            saveTask,
            now: () => 3000,
        });

        expect(saveTask.mock.calls.map(([task]) => task.status)).toEqual([
            'pending',
            'running',
            'failed',
        ]);
        expect(saveTask.mock.calls[2][0]).toEqual(expect.objectContaining({
            status: 'failed',
            errorMessage: 'Model unavailable',
            completedAt: 3000,
        }));
        expect(result.errorMessage).toBe('Model unavailable');
    });

    it('retries a persisted agent task with the same task identity and agent options', async () => {
        const saveTask = vi.fn(async (task) => task);
        const runAgent = vi.fn().mockResolvedValue({
            status: 'completed',
            content: 'Retry succeeded.',
        });

        const result = await retryReadingAgentTask({
            id: 'task-agent-retry',
            documentId: 'doc-1',
            type: 'paper_overview_agent',
            title: 'Paper overview',
            payloadJson: JSON.stringify({
                agentOptions: {
                    goal: 'Retry the overview.',
                    maxIterations: 2,
                },
                retryable: true,
            }),
        }, {
            runAgent,
            saveTask,
            now: () => 4000,
        });

        expect(runAgent).toHaveBeenCalledWith({
            goal: 'Retry the overview.',
            maxIterations: 2,
        });
        expect(saveTask.mock.calls[0][0]).toEqual(expect.objectContaining({
            id: 'task-agent-retry',
            documentId: 'doc-1',
            type: 'paper_overview_agent',
            title: 'Paper overview',
            payload: {
                agentOptions: {
                    goal: 'Retry the overview.',
                    maxIterations: 2,
                },
                retryable: true,
            },
        }));
        expect(result.status).toBe('succeeded');
    });

    it('throws a clear error when retrying a task without agent options', async () => {
        await expect(retryReadingAgentTask({
            id: 'task-agent-missing-payload',
            documentId: 'doc-1',
            type: 'paper_overview_agent',
            payloadJson: '{}',
        })).rejects.toThrow('retryReadingAgentTask requires payload.agentOptions');
    });
});
