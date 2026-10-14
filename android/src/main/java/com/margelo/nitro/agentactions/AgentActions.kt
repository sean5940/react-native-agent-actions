package com.margelo.nitro.agentactions

import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
class AgentActions : HybridAgentActionsSpec() {
  override fun setRequestListener(listener: (requestId: String, action: String, payloadJson: String) -> Unit) {
    TODO("Android dispatcher is not implemented yet")
  }

  override fun resolveRequest(requestId: String, resultJson: String) {
    TODO("Android dispatcher is not implemented yet")
  }

  override fun rejectRequest(requestId: String, message: String) {
    TODO("Android dispatcher is not implemented yet")
  }
}
