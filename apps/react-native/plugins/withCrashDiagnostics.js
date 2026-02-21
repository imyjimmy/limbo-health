// plugins/withCrashDiagnostics.js
// Expo config plugin that adds an uncaught exception handler to AppDelegate.
// This logs the exception name, reason, and stack trace before the app crashes,
// so the info appears in .ips crash reports under the "asi" section.

const { withAppDelegate } = require('expo/config-plugins');

module.exports = function withCrashDiagnostics(config) {
  return withAppDelegate(config, (config) => {
    const contents = config.modResults.contents;

    // Insert the exception handler right after didFinishLaunchingWithOptions opens
    const target = 'let delegate = ReactNativeDelegate()';
    const injection = `// Crash diagnostics: log uncaught ObjC exceptions before abort
    NSSetUncaughtExceptionHandler { exception in
      NSLog("CRASH_DIAG UNCAUGHT EXCEPTION: %@", exception.name.rawValue)
      NSLog("CRASH_DIAG REASON: %@", exception.reason ?? "nil")
      NSLog("CRASH_DIAG STACK: %@", exception.callStackSymbols.joined(separator: "\\n"))
    }

    let delegate = ReactNativeDelegate()`;

    if (contents.includes('NSSetUncaughtExceptionHandler')) {
      // Already injected, skip
      return config;
    }

    config.modResults.contents = contents.replace(target, injection);
    return config;
  });
};
