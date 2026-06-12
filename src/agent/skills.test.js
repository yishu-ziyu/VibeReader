import { describe, expect, it } from 'vitest';
import {
    buildReadingAgentTask,
    getReadingAgentSkill,
    listReadingAgentSkills,
} from './skills';

describe('reading agent skills', () => {
    it('lists the first reading-task skills as stable task definitions', () => {
        const skills = listReadingAgentSkills();

        expect(skills.map((skill) => skill.type)).toEqual([
            'paper_overview_agent',
            'attention_agent',
            'card_generation_agent',
            'note_export_agent',
        ]);
        expect(skills[0]).toEqual(expect.objectContaining({
            type: 'paper_overview_agent',
            title: 'Paper overview',
            skillPath: 'docs/reading-agent-skills/paper-overview.md',
            requiredTools: [
                'get_current_document',
                'get_document_chunks',
            ],
            outputArtifactType: 'reading_note',
        }));
        expect(skills[2]).toEqual(expect.objectContaining({
            type: 'card_generation_agent',
            title: 'Create VibeCard',
            skillPath: 'docs/reading-agent-skills/card-generation.md',
            requiredTools: [
                'get_current_document',
                'get_document_chunks',
                'create_vibecard',
            ],
            outputArtifactType: 'vibecard',
            maxIterations: 6,
        }));
    });

    it('builds a serializable task payload from a skill and current document', () => {
        const task = buildReadingAgentTask('paper_overview_agent', {
            id: 'doc-1',
            name: 'paper.pdf',
        });

        expect(task).toEqual({
            documentId: 'doc-1',
            type: 'paper_overview_agent',
            title: 'Paper overview',
            payload: {
                agentOptions: {
                    taskType: 'paper_overview_agent',
                    skillPath: 'docs/reading-agent-skills/paper-overview.md',
                    documentId: 'doc-1',
                    goal: expect.stringContaining('paper overview'),
                    maxIterations: 4,
                    requiredTools: [
                        'get_current_document',
                        'get_document_chunks',
                    ],
                    outputArtifactType: 'reading_note',
                },
            },
        });
        expect(JSON.parse(JSON.stringify(task))).toEqual(task);
    });

    it('fails clearly for unknown reading task types', () => {
        expect(getReadingAgentSkill('unknown_agent')).toBeNull();
        expect(() => buildReadingAgentTask('unknown_agent', { id: 'doc-1' })).toThrow(
            'Unknown reading agent skill: unknown_agent'
        );
    });
});
