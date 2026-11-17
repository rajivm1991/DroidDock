/**
 * Lets an async loader tell whether a newer request has started since it began, so a slow
 * result never overwrites newer state. Call `begin()` when a request starts, and check
 * `isCurrent(id)` after every await, before touching state.
 */
export function createRequestGuard() {
  let latest = 0;
  return {
    begin(): number {
      latest += 1;
      return latest;
    },
    isCurrent(id: number): boolean {
      return id === latest;
    },
  };
}
