import { describe, expect, it } from 'vitest';
import * as agent from './index';

describe('agent public exports', () => {
    it('exports the runtime skeleton modules', () => {
        expect(agent.runReadingAgent).toBeTypeOf('function');
        expect(agent.createReadingTools).toBeTypeOf('function');
        expect(agent.packDocumentContext).toBeTypeOf('function');
        expect(agent.isToolAllowed).toBeTypeOf('function');
    });
});
