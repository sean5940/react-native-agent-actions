package com.margelo.nitro.agentactions
  
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
class AgentActions : HybridAgentActionsSpec() {
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }
}
