import { packDocumentContext } from './contextPacker';
import {
    DEFAULT_READING_PERMISSIONS,
    assertToolAllowed,
} from './permissions';

const DEFAULT_MAX_ITERATIONS = 4;
const DEFAULT_TIMEOUT_MS = 30000;

function normalizeIterations(maxIterations) {
    const value = Number(maxIterations || DEFAULT_MAX_ITERATIONS);
    if (!Number.isInteger(value) || value < 1) return DEFAULT_MAX_ITERATIONS;
    return value;
}

function normalizeTimeout(timeoutMs) {
    const value = Number(timeoutMs || DEFAULT_TIMEOUT_MS);
    if (!Number.isFinite(value) || value < 1) return DEFAULT_TIMEOUT_MS;
    return value;
}

function createModelTrace(response, iteration) {
    return Object.freeze({
        type: 'model',
        iteration,
        response,
    });
}

function createToolTrace(toolName, args, result, iteration) {
    return Object.freeze({
        type: 'tool',
        iteration,
        toolName,
        args,
        result,
    });
}

function finalResult(response, trace, iterations) {
    const sourceRefs = Array.isArray(response.sourceRefs) ? response.sourceRefs : [];
    return Object.freeze({
        status: 'completed',
        content: response.content || '',
        artifact: response.artifact || null,
        artifacts: Object.freeze([...(response.artifacts || [])]),
        sourceRefs: Object.freeze(sourceRefs.map((sourceRef) => Object.freeze({ ...sourceRef }))),
        trace: Object.freeze(trace),
        iterations,
    });
}

function limitResult(status, trace, iterations, error = '') {
    return Object.freeze({
        status,
        trace: Object.freeze(trace),
        iterations,
        error,
    });
}

function toolCallFromResponse(response = {}) {
    if (response.type !== 'tool_call') return null;
    return Object.freeze({
        toolName: response.toolName || response.name,
        args: Object.freeze({ ...(response.args || {}) }),
    });
}

function buildPackedContext(goal, context, contextOptions) {
    if (!context) return null;
    if (context.prompt && Array.isArray(context.chunks)) return context;
    return packDocumentContext({ goal, ...context }, contextOptions);
}

async function runLoop(options) {
    const {
        goal = '',
        model,
        tools = {},
        permissions = DEFAULT_READING_PERMISSIONS,
        context = null,
        contextOptions = {},
    } = options;
    const maxIterations = normalizeIterations(options.maxIterations);
    const packedContext = buildPackedContext(goal, context, contextOptions);
    let trace = [];

    if (typeof model !== 'function') {
        return limitResult('invalid_model', trace, 0, 'A model function is required');
    }

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
        const response = await model({
            goal,
            context: packedContext,
            iteration,
            trace: Object.freeze([...trace]),
        });
        trace = [...trace, createModelTrace(response, iteration)];

        if (response?.type === 'final') {
            return finalResult(response, trace, iteration);
        }

        const toolCall = toolCallFromResponse(response);
        if (!toolCall?.toolName) {
            return limitResult('invalid_response', trace, iteration, 'Model response must be final or tool_call');
        }

        try {
            assertToolAllowed(toolCall.toolName, permissions);
        } catch (error) {
            return limitResult('permission_denied', trace, iteration, error.message);
        }

        const tool = tools[toolCall.toolName];
        if (!tool?.run) {
            return limitResult('tool_not_found', trace, iteration, `Tool "${toolCall.toolName}" is not registered`);
        }

        const toolResult = await tool.run(toolCall.args);
        trace = [...trace, createToolTrace(toolCall.toolName, toolCall.args, toolResult, iteration)];
    }

    return limitResult('max_iterations', trace, maxIterations);
}

function withTimeout(work, timeoutMs) {
    let timeoutId;
    const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(() => {
            resolve(limitResult('timeout', [], 0, `Reading agent timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([work(), timeout]).finally(() => {
        clearTimeout(timeoutId);
    });
}

export async function runReadingAgent(options = {}) {
    const timeoutMs = normalizeTimeout(options.timeoutMs);

    try {
        return await withTimeout(() => runLoop(options), timeoutMs);
    } catch (error) {
        return limitResult('error', [], 0, error.message || 'Reading agent failed');
    }
}
