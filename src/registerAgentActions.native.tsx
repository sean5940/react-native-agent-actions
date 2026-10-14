import { AppRegistry, Platform } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import type { AgentActions } from './AgentActions.nitro';
import { toEnvelope } from './reply';
import type { AgentActionHandler } from './types';

const native = NitroModules.createHybridObject<AgentActions>('AgentActions');

// Android delivers each call as a Headless JS task so that timers keep running while the app is in the background.
const ANDROID_TASK_KEY = 'AgentActionsRequest';

interface Request {
  requestId: string;
  action: string;
  payloadJson: string;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Registers the JavaScript handlers that agents call through the OS.
 *
 * Call it once at module scope (for example in `index.js`), not inside a component.
 * When the OS starts the app in the background to run an action, no screen may be rendered,
 * so handlers registered from a component would never be reached.
 *
 * Type the handlers with the generated `AgentActionHandlers` interface to get a handler
 * for every declared action with the right parameter and result types.
 */
export function registerAgentActions<Handlers extends object>(
  handlers: Handlers
): void {
  const table = handlers as unknown as Record<
    string,
    AgentActionHandler | undefined
  >;

  const handle = async ({
    requestId,
    action,
    payloadJson,
  }: Request): Promise<void> => {
    const handler = table[action];
    if (typeof handler !== 'function') {
      native.rejectRequest(
        requestId,
        `No handler is registered for "${action}".`
      );
      return;
    }
    try {
      const result = await handler(JSON.parse(payloadJson));
      native.resolveRequest(requestId, toEnvelope(result));
    } catch (error) {
      native.rejectRequest(requestId, toMessage(error));
    }
  };

  if (Platform.OS === 'android') {
    AppRegistry.registerHeadlessTask(
      ANDROID_TASK_KEY,
      () => (request) => handle(request as Request)
    );
  }
  native.setRequestListener((requestId, action, payloadJson) => {
    handle({ requestId, action, payloadJson });
  });
}
