import { savePersistentTask } from '../services/persistentStorage';
import { runReadingAgent } from './runtime';

function timestamp(now) {
    return typeof now === 'function' ? now() : Date.now();
}

function generatedTaskId(task = {}, now) {
    if (task.id) return task.id;
    const documentId = task.documentId || 'document';
    const type = task.type || 'reading_agent';
    return `task-${type}-${documentId}-${timestamp(now)}`;
}

function agentResultSummary(agentResult = {}) {
    const artifacts = Array.isArray(agentResult.artifacts) ? agentResult.artifacts : [];
    const sourceRefs = Array.isArray(agentResult.sourceRefs)
        ? agentResult.sourceRefs.map((sourceRef) => ({ ...sourceRef }))
        : [];
    return {
        agentStatus: agentResult.status || 'unknown',
        content: agentResult.content || '',
        artifactCount: artifacts.length + (agentResult.artifact ? 1 : 0),
        ...(sourceRefs.length > 0 ? { sourceRefs } : {}),
    };
}

function errorMessageForAgentResult(agentResult = {}) {
    return agentResult.error || `Reading agent ended with status: ${agentResult.status || 'unknown'}`;
}

function parsePayload(task = {}) {
    if (task.payload && typeof task.payload === 'object' && !Array.isArray(task.payload)) {
        return { ...task.payload };
    }

    if (typeof task.payloadJson === 'string' && task.payloadJson.trim()) {
        try {
            const parsed = JSON.parse(task.payloadJson);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    return {};
}

function taskPayload(task = {}, agentOptions = {}) {
    const payload = parsePayload(task);
    if (!agentOptions || Object.keys(agentOptions).length === 0) return payload;
    if (payload.agentOptions) return payload;
    return {
        ...payload,
        agentOptions,
    };
}

function taskBase(task = {}, now, agentOptions = {}) {
    const id = generatedTaskId(task, now);
    return {
        id,
        documentId: task.documentId || null,
        type: task.type || 'reading_agent',
        title: task.title || 'Reading agent task',
        payload: taskPayload(task, agentOptions),
        createdAt: timestamp(now),
    };
}

export async function runReadingAgentTask(options = {}) {
    const {
        task = {},
        agentOptions = {},
        runAgent = runReadingAgent,
        saveTask = savePersistentTask,
        now,
    } = options;
    const base = taskBase(task, now, agentOptions);
    const startedAt = timestamp(now);

    await saveTask({
        ...base,
        status: 'pending',
        progress: 0,
        updatedAt: startedAt,
    });

    await saveTask({
        ...base,
        status: 'running',
        progress: 10,
        startedAt,
        updatedAt: startedAt,
    });

    try {
        const agentResult = await runAgent(agentOptions);
        const completedAt = timestamp(now);
        const result = agentResultSummary(agentResult);

        if (agentResult?.status === 'completed') {
            const taskRecord = await saveTask({
                ...base,
                status: 'succeeded',
                progress: 100,
                result,
                startedAt,
                completedAt,
                updatedAt: completedAt,
            });

            return Object.freeze({
                status: 'succeeded',
                taskId: base.id,
                task: taskRecord,
                agentResult,
            });
        }

        const errorMessage = errorMessageForAgentResult(agentResult);
        const taskRecord = await saveTask({
            ...base,
            status: 'failed',
            progress: 100,
            result,
            errorMessage,
            startedAt,
            completedAt,
            updatedAt: completedAt,
        });

        return Object.freeze({
            status: 'failed',
            taskId: base.id,
            task: taskRecord,
            agentResult,
            errorMessage,
        });
    } catch (error) {
        const completedAt = timestamp(now);
        const errorMessage = error?.message || String(error);
        const taskRecord = await saveTask({
            ...base,
            status: 'failed',
            progress: 100,
            errorMessage,
            startedAt,
            completedAt,
            updatedAt: completedAt,
        });

        return Object.freeze({
            status: 'failed',
            taskId: base.id,
            task: taskRecord,
            agentResult: null,
            errorMessage,
        });
    }
}

export async function retryReadingAgentTask(taskRecord = {}, options = {}) {
    const payload = parsePayload(taskRecord);
    const agentOptions = options.agentOptions || payload.agentOptions;

    if (!agentOptions) {
        throw new Error('retryReadingAgentTask requires payload.agentOptions');
    }

    return runReadingAgentTask({
        ...options,
        task: {
            id: taskRecord.id,
            documentId: taskRecord.documentId || taskRecord.document_id || null,
            type: taskRecord.type || taskRecord.taskType || 'reading_agent',
            title: taskRecord.title || 'Reading agent task',
            payload,
        },
        agentOptions,
    });
}
