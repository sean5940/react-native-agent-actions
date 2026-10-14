import { AppState } from 'react-native';

export interface CallLogEntry {
  id: number;
  at: Date;
  action: string;
  params: unknown;
  /** AppState when the call arrived. `background` means no screen was showing. */
  appState: string;
  outcome: { ok: true; result: unknown } | { ok: false; error: string };
}

let entries: readonly CallLogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

export function getCallLog(): readonly CallLogEntry[] {
  return entries;
}

export function subscribeToCallLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function record(entry: Omit<CallLogEntry, 'id'>) {
  entries = [{ id: nextId++, ...entry }, ...entries];
  listeners.forEach((listener) => listener());
}

/** Wraps a handler so that every call shows up in the example app's call log. */
export function withCallLog<Params, Result>(
  action: string,
  handler: (params: Params) => Result | Promise<Result>
): (params: Params) => Promise<Result> {
  return async (params) => {
    const at = new Date();
    const appState = AppState.currentState ?? 'unknown';
    try {
      const result = await handler(params);
      record({ at, action, params, appState, outcome: { ok: true, result } });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record({
        at,
        action,
        params,
        appState,
        outcome: { ok: false, error: message },
      });
      throw error;
    }
  };
}
