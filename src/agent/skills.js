const READING_AGENT_SKILLS = Object.freeze([
    Object.freeze({
        type: 'paper_overview_agent',
        title: 'Paper overview',
        skillPath: 'docs/reading-agent-skills/paper-overview.md',
        goal: 'Create a concise paper overview for the current document using safe metadata and bounded source chunks.',
        requiredTools: Object.freeze([
            'get_current_document',
            'get_document_chunks',
        ]),
        outputArtifactType: 'reading_note',
        maxIterations: 4,
    }),
    Object.freeze({
        type: 'attention_agent',
        title: 'Attention route',
        skillPath: 'docs/reading-agent-skills/attention-route.md',
        goal: 'Identify the most important source-grounded reading positions and rank them as a short reading route.',
        requiredTools: Object.freeze([
            'get_current_document',
            'get_document_chunks',
            'list_attention_insights',
        ]),
        outputArtifactType: 'attention_insights',
        maxIterations: 4,
    }),
    Object.freeze({
        type: 'card_generation_agent',
        title: 'Card generation',
        skillPath: 'docs/reading-agent-skills/card-generation.md',
        goal: 'Generate source-grounded VibeCards from the current document without inventing unsupported claims.',
        requiredTools: Object.freeze([
            'get_current_document',
            'get_document_chunks',
            'create_vibecard',
        ]),
        outputArtifactType: 'vibecard',
        maxIterations: 4,
    }),
    Object.freeze({
        type: 'note_export_agent',
        title: 'Note export',
        skillPath: 'docs/reading-agent-skills/note-export.md',
        goal: 'Assemble a source-grounded reading note export from saved summaries, insights, cards, and document metadata.',
        requiredTools: Object.freeze([
            'get_current_document',
            'list_attention_insights',
            'export_note',
        ]),
        outputArtifactType: 'reading_note_export',
        maxIterations: 3,
    }),
]);

function cloneSkill(skill) {
    return {
        ...skill,
        requiredTools: [...skill.requiredTools],
    };
}

export function listReadingAgentSkills() {
    return READING_AGENT_SKILLS.map(cloneSkill);
}

export function getReadingAgentSkill(type) {
    const skill = READING_AGENT_SKILLS.find((candidate) => candidate.type === type);
    return skill ? cloneSkill(skill) : null;
}

export function buildReadingAgentTask(type, document = {}, overrides = {}) {
    const skill = getReadingAgentSkill(type);
    if (!skill) {
        throw new Error(`Unknown reading agent skill: ${type}`);
    }

    const documentId = overrides.documentId || document.id || null;
    const goal = overrides.goal || skill.goal;
    const maxIterations = overrides.maxIterations || skill.maxIterations;

    return {
        documentId,
        type: skill.type,
        title: overrides.title || skill.title,
        payload: {
            ...(overrides.payload || {}),
            agentOptions: {
                taskType: skill.type,
                skillPath: skill.skillPath,
                documentId,
                goal,
                maxIterations,
                requiredTools: [...skill.requiredTools],
                outputArtifactType: skill.outputArtifactType,
            },
        },
    };
}
