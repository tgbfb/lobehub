import { describe, expect, it } from 'vitest';

import { getViteDevOrigin, resolveViteDevPort } from './viteDevOrigin';

describe('viteDevOrigin', () => {
  it('should use the reserved Vite port when provided', () => {
    expect(resolveViteDevPort('43123')).toBe(43123);
    expect(getViteDevOrigin('43123')).toBe('http://localhost:43123');
  });

  it('should fall back to the default port for invalid values', () => {
    expect(resolveViteDevPort('')).toBe(9876);
    expect(resolveViteDevPort('not-a-port')).toBe(9876);
    expect(resolveViteDevPort('70000')).toBe(9876);
    expect(getViteDevOrigin('0')).toBe('http://localhost:9876');
  });
});
