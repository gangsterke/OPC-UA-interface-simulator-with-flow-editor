export class CancellationToken {
  private cancelled = false;
  private listeners: Array<() => void> = [];

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const listener of this.listeners) listener();
    this.listeners = [];
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  onCancel(listener: () => void): void {
    if (this.cancelled) {
      listener();
      return;
    }
    this.listeners.push(listener);
  }
}
