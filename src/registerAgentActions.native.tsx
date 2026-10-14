import { NitroModules } from 'react-native-nitro-modules';
import type { AgentActions } from './AgentActions.nitro';
import type { AgentActionHandlers } from './types';

const native = NitroModules.createHybridObject<AgentActions>('AgentActions');

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Registers the JavaScript handlers that agents call through the OS.
 *
 * Call it at module scope (for example in `index.js`), not inside a component.
 * When the OS launches the app in the background to run an action, no screen is rendered,
 * so handlers registered from a component would never be reached.
 */
export function registerAgentActions(handlers: AgentActionHandlers): void {
  native.setRequestListener((requestId, action, payloadJson) => {
    const handler = handlers[action];
    if (handler === undefined) {
      native.rejectRequest(
        requestId,
        `No handler is registered for "${action}".`
      );
      return;
    }
    Promise.resolve()
      .then(() => handler(JSON.parse(payloadJson)))
      .then((result) =>
        native.resolveRequest(requestId, JSON.stringify(result ?? null))
      )
      .catch((error: unknown) =>
        native.rejectRequest(requestId, toMessage(error))
      );
  });
}
