import { describe, expect, test } from 'bun:test';
import { createValidationScheduler } from '../src/validation.js';

describe('validation scheduler', () => {
  test('debounces rapid changes and keeps only the latest validation id', async () => {
    const calls: Array<{ uri: string; validationId: number; latest: boolean }> = [];
    const scheduler = createValidationScheduler(async (uri, validationId) => {
      calls.push({ uri, validationId, latest: scheduler.isLatest(uri, validationId) });
    }, 40);

    scheduler.schedule('file:///demo.zen');
    scheduler.schedule('file:///demo.zen');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(calls).toEqual([
      { uri: 'file:///demo.zen', validationId: 2, latest: true }
    ]);
    scheduler.dispose();
  });

  test('flush validates immediately and clears pending timers', async () => {
    const calls: number[] = [];
    const scheduler = createValidationScheduler(async (_uri, validationId) => {
      calls.push(validationId);
    }, 200);

    scheduler.schedule('file:///demo.zen');
    await scheduler.flush('file:///demo.zen');
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(calls).toEqual([2]);
    scheduler.dispose();
  });
});
