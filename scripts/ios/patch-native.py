#!/usr/bin/env python3
"""Patches the Swift/storyboard files that `cap add ios` generates.

Usage: patch-native.py <ios/App/App directory>

 * AppDelegate: AVAudioSession "playback" category. Without it WKWebView audio is muted by the silent
   switch and stops when the app is backgrounded.
 * MonoViewController: black chrome, light status bar, native edge-swipe for page history. It replaces
   CAPBridgeViewController either in SceneDelegate.swift (newer templates) or Main.storyboard (older ones).

Fails loudly if the template changed, so a broken patch can never ship silently.
"""
import pathlib
import sys

app_dir = pathlib.Path(sys.argv[1])
app_delegate = app_dir / "AppDelegate.swift"
scene_delegate = app_dir / "SceneDelegate.swift"
storyboard = app_dir / "Base.lproj" / "Main.storyboard"

src = app_delegate.read_text()

marker = "// Override point for customization after application launch."
assert marker in src, "AppDelegate template changed: launch marker not found"
src = src.replace(
    marker,
    """// Keep audio playing with the silent switch on and while the app is in the background.
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            print("AVAudioSession setup failed: \\(error)")
        }""",
    1,
)

marker = "// Restart any tasks that were paused (or not yet started) while the application was inactive."
assert marker in src, "AppDelegate template changed: didBecomeActive marker not found"
src = src.replace(marker, "try? AVAudioSession.sharedInstance().setActive(true)\n        " + marker, 1)

assert "import UIKit" in src, "AppDelegate template changed: no UIKit import"
src = src.replace("import UIKit", "import UIKit\nimport AVFoundation", 1)

src += """

/// Main view controller: black chrome, light status bar, native edge-swipe for page history.
class MonoViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        webView?.allowsBackForwardNavigationGestures = true
        webView?.allowsLinkPreview = false
        webView?.isOpaque = false
        webView?.backgroundColor = .black
        webView?.scrollView.backgroundColor = .black
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
"""
app_delegate.write_text(src)

patched = []
if scene_delegate.exists():
    scene = scene_delegate.read_text()
    if "CAPBridgeViewController()" in scene:
        scene_delegate.write_text(scene.replace("CAPBridgeViewController()", "MonoViewController()"))
        patched.append("SceneDelegate.swift")

if storyboard.exists():
    board = storyboard.read_text()
    old = 'customClass="CAPBridgeViewController" customModule="Capacitor"'
    if old in board:
        storyboard.write_text(
            board.replace(old, 'customClass="MonoViewController" customModule="App" customModuleProvider="target"')
        )
        patched.append("Main.storyboard")

assert patched, "Could not hook MonoViewController into SceneDelegate.swift or Main.storyboard"
print("patched AppDelegate.swift +", ", ".join(patched))
