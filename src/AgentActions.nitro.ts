import type { HybridObject } from 'react-native-nitro-modules';

export interface AgentActions extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  setRequestListener(
    listener: (requestId: string, action: string, payloadJson: string) => void
  ): void;
  resolveRequest(requestId: string, resultJson: string): void;
  rejectRequest(requestId: string, message: string): void;
}
