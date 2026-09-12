/** Tracks accepted work until shutdown. Failures remain visible to the caller. */
export class PendingTasks {
  private readonly pending = new Set<Promise<unknown>>();
  track<T>(task: Promise<T>): Promise<T> {
    this.pending.add(task);
    void task.then(() => this.pending.delete(task), () => this.pending.delete(task));
    return task;
  }
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled(this.pending);
  }
}
