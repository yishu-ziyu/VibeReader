import { describe, expect, it } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore', () => {
  it('starts the right pane on Notes so saved reading artifacts are first-class', () => {
    expect(useUIStore.getInitialState().rightToolTab).toBe('artifacts');
  });
});
