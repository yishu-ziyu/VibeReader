export const READING_TOOL_NAMES = Object.freeze([
    'extractText',
    'navigatePage',
    'listAnnotations',
]);

export const DEFAULT_READING_PERMISSIONS = Object.freeze({
    allowedTools: READING_TOOL_NAMES,
    canReadDocument: true,
    canNavigate: true,
    canListAnnotations: true,
    canWriteAnnotations: false,
    canUseWeb: false,
});

const TOOL_PERMISSION_FLAGS = Object.freeze({
    extractText: 'canReadDocument',
    navigatePage: 'canNavigate',
    listAnnotations: 'canListAnnotations',
});

function allowedToolSet(permissions = DEFAULT_READING_PERMISSIONS) {
    return new Set(permissions.allowedTools || DEFAULT_READING_PERMISSIONS.allowedTools);
}

function hasRequiredFlag(toolName, permissions = DEFAULT_READING_PERMISSIONS) {
    const flagName = TOOL_PERMISSION_FLAGS[toolName];
    if (!flagName) return true;
    if (permissions[flagName] === undefined) return DEFAULT_READING_PERMISSIONS[flagName];
    return Boolean(permissions[flagName]);
}

export function isToolAllowed(toolName, permissions = DEFAULT_READING_PERMISSIONS) {
    if (!toolName) return false;
    return allowedToolSet(permissions).has(toolName) && hasRequiredFlag(toolName, permissions);
}

export function assertToolAllowed(toolName, permissions = DEFAULT_READING_PERMISSIONS) {
    if (!isToolAllowed(toolName, permissions)) {
        throw new Error(`Tool "${toolName}" is not allowed by the reading agent permissions`);
    }
    return true;
}

export function filterAllowedTools(registry = {}, permissions = DEFAULT_READING_PERMISSIONS) {
    return Object.freeze(
        Object.fromEntries(
            Object.entries(registry).filter(([toolName]) => isToolAllowed(toolName, permissions))
        )
    );
}
