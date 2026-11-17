/**
 * Runs async tasks with at most `max` in flight. The rest wait their turn, in order.
 * A failed task still frees its slot.
 */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        // Promise.resolve().then also turns a task that throws before returning into a rejection.
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(release);
      };
      if (active < max) start();
      else waiting.push(start);
    });
  };
}
