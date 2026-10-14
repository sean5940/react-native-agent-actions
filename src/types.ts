export type AgentActionHandler = (payload: unknown) => unknown;

export type AgentActionHandlers = Record<string, AgentActionHandler>;
