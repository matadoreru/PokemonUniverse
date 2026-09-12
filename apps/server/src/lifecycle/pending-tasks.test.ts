import { expect, it } from 'vitest';
import { PendingTasks } from './pending-tasks.js';

it('drains work added while an accepted operation completes, including failures', async () => {
  const tasks = new PendingTasks();
  let finish!: () => void;
  let childFinished = false;
  tasks.track(new Promise<void>((resolve) => { finish = resolve; }).then(() => {
    tasks.track(Promise.resolve().then(() => { childFinished = true; }));
  }));
  const drained = tasks.flush();
  expect(childFinished).toBe(false);
  finish();
  await drained;
  expect(childFinished).toBe(true);
  await expect(tasks.track(Promise.reject(new Error('database unavailable')))).rejects.toThrow('database unavailable');
  await tasks.flush();
});
