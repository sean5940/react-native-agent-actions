import Foundation
import os

public enum AgentActionsError: LocalizedError, CustomStringConvertible {
  case timedOut(action: String, milliseconds: Int)
  case rejected(message: String)
  case cancelled(action: String)
  case invalidResult(action: String, expected: String)

  public var description: String {
    switch self {
    case let .timedOut(action, milliseconds):
      return "The JavaScript handler for \"\(action)\" did not respond within \(milliseconds) ms."
    case let .rejected(message):
      return message
    case let .cancelled(action):
      return "The call to \"\(action)\" was cancelled."
    case let .invalidResult(action, expected):
      return "The JavaScript handler for \"\(action)\" did not return \(expected)."
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

  /// Sends `payload` to the JavaScript handler of `action` and returns the decoded JSON result.
  public func invoke(action: String, payload: [String: Any], timeoutMs: Int) async throws -> Any {
    let data = try JSONSerialization.data(withJSONObject: payload)
    let payloadJson = String(decoding: data, as: UTF8.self)
    let resultJson = try await dispatch(action: action, payloadJson: payloadJson, timeoutMs: timeoutMs)
    return try JSONSerialization.jsonObject(with: Data(resultJson.utf8), options: [.fragmentsAllowed])
  }

  public func dispatch(action: String, payloadJson: String, timeoutMs: Int) async throws -> String {
    let request = Request(id: UUID().uuidString, action: action, payloadJson: payloadJson)
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        lock.lock()
        waiting[request.id] = continuation
        let current = listener
        if current == nil {
          queued.append(request)
        }
        lock.unlock()

        Self.log.info("dispatch \(action, privacy: .public) id=\(request.id, privacy: .public) listenerReady=\(current != nil)")
        current?(request.id, request.action, request.payloadJson)

        DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) { [weak self] in
          self?.finish(request.id, with: .failure(AgentActionsError.timedOut(action: action, milliseconds: timeoutMs)))
        }
      }
    } onCancel: { [weak self] in
      self?.finish(request.id, with: .failure(AgentActionsError.cancelled(action: action)))
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

/// Converts decoded JSON results to the types App Intents can return.
public enum AgentActionsResult {
  public static func string(_ value: Any, action: String) throws -> String {
    guard let result = value as? String else { throw AgentActionsError.invalidResult(action: action, expected: "a string") }
    return result
  }

  public static func double(_ value: Any, action: String) throws -> Double {
    guard let result = value as? NSNumber, !isBoolean(result) else { throw AgentActionsError.invalidResult(action: action, expected: "a number") }
    return result.doubleValue
  }

  public static func int(_ value: Any, action: String) throws -> Int {
    guard let result = value as? NSNumber, !isBoolean(result) else { throw AgentActionsError.invalidResult(action: action, expected: "an integer") }
    return result.intValue
  }

  public static func bool(_ value: Any, action: String) throws -> Bool {
    guard let result = value as? NSNumber, isBoolean(result) else { throw AgentActionsError.invalidResult(action: action, expected: "a boolean") }
    return result.boolValue
  }

  public static func strings(_ value: Any, action: String) throws -> [String] {
    guard let array = value as? [Any] else { throw AgentActionsError.invalidResult(action: action, expected: "an array of strings") }
    return try array.map { try string($0, action: action) }
  }

  public static func doubles(_ value: Any, action: String) throws -> [Double] {
    guard let array = value as? [Any] else { throw AgentActionsError.invalidResult(action: action, expected: "an array of numbers") }
    return try array.map { try double($0, action: action) }
  }

  public static func ints(_ value: Any, action: String) throws -> [Int] {
    guard let array = value as? [Any] else { throw AgentActionsError.invalidResult(action: action, expected: "an array of integers") }
    return try array.map { try int($0, action: action) }
  }

  public static func bools(_ value: Any, action: String) throws -> [Bool] {
    guard let array = value as? [Any] else { throw AgentActionsError.invalidResult(action: action, expected: "an array of booleans") }
    return try array.map { try bool($0, action: action) }
  }

  /// Objects and arrays of objects are returned to App Intents as a JSON string.
  public static func json(_ value: Any, action: String) throws -> String {
    guard JSONSerialization.isValidJSONObject(value) else { throw AgentActionsError.invalidResult(action: action, expected: "an object or an array") }
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    return String(decoding: data, as: UTF8.self)
  }

  private static func isBoolean(_ number: NSNumber) -> Bool {
    CFGetTypeID(number) == CFBooleanGetTypeID()
  }
}
