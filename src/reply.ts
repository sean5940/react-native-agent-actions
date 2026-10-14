/** A handler result together with the sentence Siri says or shows. */
export interface AgentActionReply<T> {
  readonly __agentActionsReply: true;
  readonly value: T;
  readonly dialog: string;
}

/**
 * Returns `value` to the caller and gives Siri a sentence to say or show, for example
 * `reply(stats, { dialog: \`You have ${stats.noteCount} notes.\` })`.
 *
 * Use it when the result is not a string, or when the string is not what Siri should say.
 * Choose the dialog's language yourself, for example from the device locale.
 * Android ignores the dialog because AppFunctions has no place to show it.
 */
export function reply<T>(
  value: T,
  options: { dialog: string }
): AgentActionReply<T> {
  return { __agentActionsReply: true, value, dialog: options.dialog };
}

/** What a handler for an action whose result is `T` may return. */
export type AgentActionResult<T> =
  T | AgentActionReply<T> | Promise<T | AgentActionReply<T>>;

export function isReply(result: unknown): result is AgentActionReply<unknown> {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as { __agentActionsReply?: unknown }).__agentActionsReply === true
  );
}

/** What JavaScript sends back to the native side for every call. */
export function toEnvelope(result: unknown): string {
  if (isReply(result)) {
    return JSON.stringify({
      value: result.value ?? null,
      dialog: result.dialog,
    });
  }
  return JSON.stringify({ value: result ?? null });
}
