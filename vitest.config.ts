import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        exclude: ['**/dist/**', '**/node_modules/**', '**/target/**', '**/packages/native-ui/**'],
    },
});
