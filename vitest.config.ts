import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'evals/**/*.test.ts'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts', 'evals/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/index.ts'],
		},
	},
});
