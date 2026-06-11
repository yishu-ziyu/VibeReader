import { afterEach, describe, expect, it, vi } from 'vitest';
import { runReadingAgent } from './runtime';

describe('reading agent runtime', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('runs model and reading tool calls until a final answer is produced', async () => {
        const model = vi
            .fn()
            .mockResolvedValueOnce({
                type: 'tool_call',
                toolName: 'extractText',
                args: { page: 1 },
            })
            .mockResolvedValueOnce({
                type: 'final',
                content: 'The source supports the claim.',
            });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'Claim evidence.', page: 1 }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Check the claim.',
            model,
            tools,
            maxIterations: 4,
            timeoutMs: 1000,
        });

        expect(result).toEqual(expect.objectContaining({
            status: 'completed',
            content: 'The source supports the claim.',
            iterations: 2,
        }));
        expect(result.trace).toEqual([
            expect.objectContaining({ type: 'model', iteration: 1 }),
            expect.objectContaining({ type: 'tool', toolName: 'extractText' }),
            expect.objectContaining({ type: 'model', iteration: 2 }),
        ]);
        expect(model).toHaveBeenCalledTimes(2);
        expect(tools.extractText.run).toHaveBeenCalledWith({ page: 1 });
    });

    it('preserves source refs from a final model response', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'final',
            content: 'Overview with cited evidence.',
            sourceRefs: [
                {
                    documentId: 'doc-1',
                    page: 2,
                    paragraphId: 'page-2-para-0',
                    text: 'Evidence paragraph.',
                },
            ],
        });

        const result = await runReadingAgent({
            goal: 'Create overview.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result).toEqual(expect.objectContaining({
            status: 'completed',
            sourceRefs: [
                {
                    documentId: 'doc-1',
                    page: 2,
                    paragraphId: 'page-2-para-0',
                    text: 'Evidence paragraph.',
                },
            ],
        }));
    });

    it('stops at the configured max iteration limit', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'tool_call',
            toolName: 'extractText',
            args: { page: 1 },
        });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'More text.' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Keep reading.',
            model,
            tools,
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('max_iterations');
        expect(result.iterations).toBe(2);
        expect(model).toHaveBeenCalledTimes(2);
    });

    it('denies tool calls that are outside the permission policy', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'tool_call',
            toolName: 'createAnnotation',
            args: { text: 'write this' },
        });

        const result = await runReadingAgent({
            goal: 'Save a note.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('permission_denied');
        expect(result.error).toContain('createAnnotation');
    });

    it('denies reading tool calls when document reading permission is disabled', async () => {
        const model = vi.fn().mockResolvedValue({
            type: 'tool_call',
            toolName: 'extractText',
            args: { page: 1 },
        });
        const tools = {
            extractText: {
                name: 'extractText',
                readOnly: true,
                run: vi.fn().mockResolvedValue({ text: 'Hidden text.' }),
            },
        };

        const result = await runReadingAgent({
            goal: 'Read the current page.',
            model,
            tools,
            permissions: {
                allowedTools: ['extractText'],
                canReadDocument: false,
            },
            maxIterations: 2,
            timeoutMs: 1000,
        });

        expect(result.status).toBe('permission_denied');
        expect(result.error).toContain('extractText');
        expect(tools.extractText.run).not.toHaveBeenCalled();
    });

    it('returns a timeout result when the loop exceeds the configured time', async () => {
        vi.useFakeTimers();
        const model = vi.fn(() => new Promise((resolve) => {
            setTimeout(() => resolve({ type: 'final', content: 'Late answer.' }), 50);
        }));

        const pending = runReadingAgent({
            goal: 'Slow task.',
            model,
            tools: {},
            maxIterations: 2,
            timeoutMs: 10,
        });

        await vi.advanceTimersByTimeAsync(11);

        await expect(pending).resolves.toEqual(expect.objectContaining({
            status: 'timeout',
        }));
    });
});
