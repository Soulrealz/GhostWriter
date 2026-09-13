import test from 'node:test';
import assert from 'node:assert/strict';
import { add, subtract } from '../src/math.js';

test('add sums two numbers', () => {
	assert.equal(add(2, 3), 5);
});

test('subtract takes the second from the first', () => {
	assert.equal(subtract(5, 3), 2);
});
