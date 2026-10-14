package com.margelo.nitro.agentactions

import com.facebook.proguard.annotations.DoNotStrip
import dev.agentactions.AgentActionsDispatcher

@DoNotStrip
class AgentActions : HybridAgentActionsSpec() {
  override fun setRequestListener(listener: (requestId: String, action: String, payloadJson: String) -> Unit) {
    AgentActionsDispatcher.setListener(listener)
  }

  override fun resolveRequest(requestId: String, resultJson: String) {
    AgentActionsDispatcher.resolve(requestId, resultJson)
  }

  override fun rejectRequest(requestId: String, message: String) {
    AgentActionsDispatcher.reject(requestId, message)
  }
}
