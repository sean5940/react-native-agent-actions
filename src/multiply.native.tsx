import { NitroModules } from 'react-native-nitro-modules';
import type { AgentActions } from './AgentActions.nitro';

const AgentActionsHybridObject =
  NitroModules.createHybridObject<AgentActions>('AgentActions');

export function multiply(a: number, b: number): number {
  return AgentActionsHybridObject.multiply(a, b);
}
