require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# Pure Swift module that app code (generated App Intents) imports.
# It must not depend on the Nitro module: that module is compiled with C++ interop,
# and Swift code without C++ interop cannot import it.
Pod::Spec.new do |s|
  s.name         = "AgentActionsCore"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/sean5940/react-native-agent-actions.git", :tag => "#{s.version}" }
  s.swift_version = "5.9"

  s.source_files = "ios/core/**/*.swift"
end
