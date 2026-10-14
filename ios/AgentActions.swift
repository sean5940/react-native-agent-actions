import AgentActionsCore
import NitroModules

class AgentActions: HybridAgentActionsSpec {
  func setRequestListener(listener: @escaping (_ requestId: String, _ action: String, _ payloadJson: String) -> Void) throws {
    AgentActionsDispatcher.shared.setListener(listener)
  }

  func resolveRequest(requestId: String, resultJson: String) throws {
    AgentActionsDispatcher.shared.resolve(requestId, resultJson: resultJson)
  }

  func rejectRequest(requestId: String, message: String) throws {
    AgentActionsDispatcher.shared.reject(requestId, message: message)
  }
}
