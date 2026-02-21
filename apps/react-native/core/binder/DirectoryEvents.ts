export interface DirectoryChangedEvent {
  binderId: string;
  dirPath: string;
}

type Listener = (event: DirectoryChangedEvent) => void;

const listeners = new Set<Listener>();

export function subscribeDirectoryChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitDirectoryChanged(event: DirectoryChangedEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

