import { beforeEach, describe, expect, it, vi } from 'vitest';
import aiService from './aiService';

const encoder = new TextEncoder();

function createStreamResponse(read) {
    return {
        ok: true,
        body: {
            getReader: () => ({ read }),
        },
    };
}

describe('aiService chatStream abort support', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        aiService.clearHistory();
        aiService.setConfig({
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'test-key',
            model: 'test-model',
            apiType: 'openai-compatible',
        });
    });

    it('passes the provided AbortSignal to fetch so the active request can be cancelled', async () => {
        const controller = new AbortController();
        const read = vi.fn().mockResolvedValue({ done: true, value: undefined });
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(createStreamResponse(read));

        await aiService.chatStream('hello', vi.fn(), {
            includeHistory: false,
            signal: controller.signal,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    });

    it('reports an aborted stream as an interruption while preserving partial content', async () => {
        const abortError = new DOMException('The operation was aborted.', 'AbortError');
        const read = vi
            .fn()
            .mockResolvedValueOnce({
                done: false,
                value: encoder.encode('data: {"choices":[{"delta":{"content":"Partial answer"}}]}\n\n'),
            })
            .mockRejectedValueOnce(abortError);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(createStreamResponse(read));
        const chunks = [];

        await aiService.chatStream('hello', (chunk) => chunks.push(chunk), {
            includeHistory: false,
            signal: new AbortController().signal,
        });

        expect(chunks).toContainEqual(
            expect.objectContaining({
                done: false,
                content: 'Partial answer',
                fullMessage: 'Partial answer',
            })
        );
        expect(chunks[chunks.length - 1]).toEqual(
            expect.objectContaining({
                done: true,
                interrupted: true,
                aborted: true,
                fullMessage: 'Partial answer',
            })
        );
    });
});
