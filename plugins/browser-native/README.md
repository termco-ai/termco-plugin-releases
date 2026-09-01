# Embedded Browser

Default provider for `browser.automation`. It owns the application-wide pool of
embedded Chromium views, persistent browsing session, CDP automation, page
snapshots, screenshots, console capture, and network capture. Consumers invoke
the capability; they never create a second browser runtime.

Copy this directory, change its id, and declare `replaces: "browser-native"` to
ship a complete replacement.
