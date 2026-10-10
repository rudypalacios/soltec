import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// The remembered brand lives in localStorage, which jsdom shares between the tests of a file.
afterEach(() => window.localStorage.clear());
