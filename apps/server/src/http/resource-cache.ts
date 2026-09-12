export class ResourceCapacityError extends Error {
  readonly status = 503;
  constructor() { super('El servidor está procesando demasiados recursos. Reintenta en unos segundos.'); }
}

/** Bounded completed bytes, pending requests and concurrent loaders, with in-flight deduplication. */
export class ResourceCache<T> {
  private readonly completed = new Map<string, { value: T; bytes: number }>();
  private readonly pending = new Map<string, Promise<T>>();
  private readonly queue: Array<() => void> = [];
  private active = 0;
  private bytes = 0;
  constructor(private readonly limits: { bytes: number; entries: number; concurrency: number; pending: number }, private readonly size: (value: T) => number) {}

  load(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.completed.get(key);
    if (cached) {
      this.completed.delete(key);
      this.completed.set(key, cached);
      return Promise.resolve(cached.value);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= this.limits.pending) return Promise.reject(new ResourceCapacityError());
    const task = new Promise<T>((resolve, reject) => {
      const run = () => {
        this.active += 1;
        void Promise.resolve().then(loader).then((value) => {
          const bytes = this.size(value);
          if (bytes <= this.limits.bytes) {
            this.completed.set(key, { value, bytes });
            this.bytes += bytes;
            while (this.bytes > this.limits.bytes || this.completed.size > this.limits.entries) {
              const oldest = this.completed.keys().next().value!;
              this.bytes -= this.completed.get(oldest)!.bytes;
              this.completed.delete(oldest);
            }
          }
          resolve(value);
        }).catch(reject).finally(() => {
          this.pending.delete(key);
          this.active -= 1;
          this.queue.shift()?.();
        });
      };
      if (this.active < this.limits.concurrency) run(); else this.queue.push(run);
    });
    this.pending.set(key, task);
    return task;
  }
}
