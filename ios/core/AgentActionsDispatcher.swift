import Foundation
import os

public enum AgentActionsError: LocalizedError, CustomStringConvertible {
  case timedOut(action: String, seconds: TimeInterval)
  case rejected(message: String)

  public var description: String {
    switch self {
    case let .timedOut(action, seconds):
      return "The JavaScript handler for \"\(action)\" did not respond within \(seconds)s."
    case let .rejected(message):
      return message
    }
  }

  public var errorDescription: String? { description }
}

// App Intents shows `localizedStringResource` to the user and ignores `LocalizedError`.
@available(iOS 16.0, *)
extension AgentActionsError: CustomLocalizedStringResourceConvertible {
  public var localizedStringResource: LocalizedStringResource {
    LocalizedStringResource(stringLiteral: description)
  }
}

/// Routes calls that the OS makes into the app (App Intents) to the JavaScript handlers and waits for their result.
///
/// Calls can arrive before React Native has loaded the bundle, for example when an intent launches the app in the background.
/// Those calls are queued and handed to JavaScript once it registers a listener.
public final class AgentActionsDispatcher: @unchecked Sendable {
  public static let shared = AgentActionsDispatcher()

  static let log = Logger(subsystem: "dev.agentactions", category: "dispatcher")

  private struct Request {
    let id: String
    let action: String
    let payloadJson: String
  }

  private let lock = NSLock()
  private var listener: ((String, String, String) -> Void)?
  private var waiting: [String: CheckedContinuation<String, Error>] = [:]
  private var queued: [Request] = []

  public func dispatch(action: String, payloadJson: String, timeout: TimeInterval = 10) async throws -> String {
    let request = Request(id: UUID().uuidString, action: action, payloadJson: payloadJson)
    return try await withCheckedThrowingContinuation { continuation in
      lock.lock()
      waiting[request.id] = continuation
      let current = listener
      if current == nil {
        queued.append(request)
      }
      lock.unlock()

      Self.log.info("dispatch \(action, privacy: .public) id=\(request.id, privacy: .public) listenerReady=\(current != nil)")
      current?(request.id, request.action, request.payloadJson)

      DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self] in
        self?.finish(request.id, with: .failure(AgentActionsError.timedOut(action: action, seconds: timeout)))
      }
    }
  }

  public func setListener(_ newListener: @escaping (String, String, String) -> Void) {
    lock.lock()
    listener = newListener
    let pending = queued
    queued.removeAll()
    lock.unlock()

    Self.log.info("listener registered, flushing \(pending.count) queued request(s)")
    for request in pending {
      newListener(request.id, request.action, request.payloadJson)
    }
  }

  public func resolve(_ requestId: String, resultJson: String) {
    finish(requestId, with: .success(resultJson))
  }

  public func reject(_ requestId: String, message: String) {
    finish(requestId, with: .failure(AgentActionsError.rejected(message: message)))
  }

  private func finish(_ requestId: String, with result: Result<String, Error>) {
    lock.lock()
    let continuation = waiting.removeValue(forKey: requestId)
    queued.removeAll { $0.id == requestId }
    lock.unlock()

    guard let continuation else { return }
    Self.log.info("finish id=\(requestId, privacy: .public) success=\((try? result.get()) != nil)")
    continuation.resume(with: result)
  }
}
