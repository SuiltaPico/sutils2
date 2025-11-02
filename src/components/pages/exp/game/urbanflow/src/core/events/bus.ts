export type Unsubscribe = () => void;

type Handler<T> = (payload: T) => void;

export function createEventBus<Topics extends Record<string, any>>() {
  const handlers = new Map<keyof Topics, Set<Handler<any>>>();

  function on<K extends keyof Topics>(topic: K, handler: Handler<Topics[K]>): Unsubscribe {
    let set = handlers.get(topic);
    if (!set) {
      set = new Set();
      handlers.set(topic, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  function emit<K extends keyof Topics>(topic: K, payload: Topics[K]) {
    const set = handlers.get(topic);
    if (!set) return;
    for (const h of set) h(payload);
  }

  return { on, emit };
}


