export type ExecutorSender = {
  isDestroyed(): boolean;
  once(event: "destroyed", listener: () => void): unknown;
};

/**
 * Most-recent-first renderer executor registry. Re-registering the same
 * WebContents moves it to the front but never adds another destruction
 * listener, which is important during Vite/plugin hot replacement.
 */
export function createExecutorSenderRegistry<T extends ExecutorSender>() {
  const senders: T[] = [];
  const watched = new WeakSet<T>();
  const receivers = new WeakMap<T, (message: unknown) => void>();

  const remove = (sender: T) => {
    const index = senders.indexOf(sender);
    if (index !== -1) senders.splice(index, 1);
    receivers.delete(sender);
  };

  return {
    push(sender: T, receiver?: (message: unknown) => void): void {
      remove(sender);
      senders.unshift(sender);
      if (receiver) receivers.set(sender, receiver);
      if (watched.has(sender)) return;
      watched.add(sender);
      sender.once("destroyed", () => remove(sender));
    },
    remove,
    live(): T[] {
      return senders.filter((sender) => !sender.isDestroyed());
    },
    dispatch(sender: T, message: unknown): boolean {
      if (sender.isDestroyed()) return false;
      const receiver = receivers.get(sender);
      if (!receiver) return false;
      receiver(message);
      return true;
    },
    route(event: string): (sender: T, payload: unknown) => void {
      return (sender, payload) => {
        this.dispatch(sender, { event, payload });
      };
    },
  };
}
