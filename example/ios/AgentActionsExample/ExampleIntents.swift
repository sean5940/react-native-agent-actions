import AgentActionsCore
import AppIntents
import Foundation

private func callJavaScript(_ action: String, _ payload: [String: Any], timeout: TimeInterval) async throws -> String {
  let data = try JSONSerialization.data(withJSONObject: payload)
  let payloadJson = String(data: data, encoding: .utf8) ?? "{}"
  return try await AgentActionsDispatcher.shared.dispatch(action: action, payloadJson: payloadJson, timeout: timeout)
}

@available(iOS 16.0, *)
struct EchoIntent: AppIntent {
  static let title: LocalizedStringResource = "Echo through JavaScript"
  static let description = IntentDescription("Sends text to the JavaScript handler and returns its reply.")

  @Parameter(title: "Text", default: "hello")
  var text: String

  func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let started = Date()
    let reply = try await callJavaScript("echo", ["text": text], timeout: 25)
    let elapsed = Int(Date().timeIntervalSince(started) * 1000)
    return .result(value: reply, dialog: "\(reply) (\(elapsed) ms)")
  }
}

@available(iOS 16.0, *)
struct WaitIntent: AppIntent {
  static let title: LocalizedStringResource = "Wait in JavaScript"

  @Parameter(title: "Milliseconds", default: 25000)
  var ms: Int

  func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let reply = try await callJavaScript("wait", ["ms": ms], timeout: 120)
    return .result(value: reply, dialog: "\(reply)")
  }
}

@available(iOS 16.0, *)
struct LongWaitIntent: AppIntent {
  static let title: LocalizedStringResource = "Wait 60 seconds in JavaScript"

  func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    let reply = try await callJavaScript("wait", ["ms": 60000], timeout: 120)
    return .result(value: reply, dialog: "\(reply)")
  }
}

@available(iOS 16.0, *)
struct FailIntent: AppIntent {
  static let title: LocalizedStringResource = "Fail in JavaScript"

  func perform() async throws -> some IntentResult & ReturnsValue<String> {
    let reply = try await callJavaScript("fail", [:], timeout: 10)
    return .result(value: reply)
  }
}

@available(iOS 16.0, *)
struct ExampleShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: EchoIntent(),
      phrases: ["Echo with \(.applicationName)"],
      shortTitle: "Echo",
      systemImageName: "text.bubble"
    )
    AppShortcut(
      intent: WaitIntent(),
      phrases: ["Wait with \(.applicationName)"],
      shortTitle: "Wait",
      systemImageName: "hourglass"
    )
    AppShortcut(
      intent: LongWaitIntent(),
      phrases: ["Wait long with \(.applicationName)"],
      shortTitle: "Wait 60s",
      systemImageName: "timer"
    )
    AppShortcut(
      intent: FailIntent(),
      phrases: ["Fail with \(.applicationName)"],
      shortTitle: "Fail",
      systemImageName: "xmark.octagon"
    )
  }
}
