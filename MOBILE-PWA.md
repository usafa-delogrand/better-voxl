# Voxl on phones and tablets

## Install

Serve the stream over HTTPS (localhost is also a secure context for development).
Open the stream URL itself, not just the site embedding it in an iframe.

- iPhone/iPad: open in Safari, Share → Add to Home Screen → Open as Web App if offered.
- Chrome/Edge/Android: use Install in Voxl or the browser's Install app menu.
- The app runs standalone. It may ask for your normal Voxl sign-in again. The
  manifest deliberately contains no token or password.
- A live network connection and a running VM are still required. The service worker
  is network-only; it does not cache desktop HTML, credentials, remote files, or media.
  When offline it shows a retry page instead of a stale desktop.
- Current WebCodecs and OffscreenCanvas support are required. This change does not
  add a legacy video decoder for older Safari versions.

## Control tabs

Controls are grouped into **Mouse**, **i3**, **Keys**, and **More**.
Mobile starts on Mouse. Desktop hides the touch-only Mouse tab, starts on i3,
and keeps the dock in the top corner. Tabs support keyboard arrow/Home/End navigation.
Changing tabs releases pointer gestures, so a hidden joystick cannot keep moving.

**Keys** provides the soft keyboard, Esc, **← ↑ ↓ →**, and latched **Ctrl / Alt / Super** toggles.
Arrow taps preserve latched modifiers (for example Ctrl+Left). On tablets the arrow
keys sit beside modifiers, without adding another row.
Modifiers work for typing and mouse clicks, persist across tabs/dock collapse, and
release on blur, backgrounding or explicit input reset. Super is the actual Super
key even when physical Mac Command is mapped to Ctrl. Dedicated Tab, Enter and
Ctrl+C/V/A/Z buttons are omitted. Explanatory captions and idle status text are
hidden; errors remain visible.

Control buttons and transfer-section headers keep software-keyboard focus. Text
fields and the explicit keyboard toggle can still change focus deliberately.
On iPad-sized touch viewports (700px+), the dock is up to 760px wide: mouse controls
use one row, i3 actions use a wide grid, and text transfers sit side by side.
Copy/Cut/Paste VM send normal GUI shortcuts; enable **Terminal** for Ctrl+Shift+C/V.
Ctrl + C remains a terminal interrupt. Cut is not mapped in Terminal mode.
The **>_** toggle selects terminal clipboard mode. **Device** reads local text,
sends it to the VM clipboard, then pastes.
When the browser denies clipboard permission, paste text into the Device → VM
box and use **Send & paste**. VM → device previews remote copied text and has an
explicit **Copy to device** button; if writing is denied, select and copy manually.
The panel's explicit bridge is text-only; existing system paste/image support is unchanged.
Device → VM and VM → device are independent collapsible sections, closed by
default. A blocked clipboard operation opens the relevant fallback automatically.
Clipboard text stays in page memory, not localStorage. More groups files, microphone,
fullscreen, installation, and help. iOS clipboard permissions are browser-controlled.

## Screen, dock, and background input

Portrait mobile screens align near the top (inside safe areas), leaving a continuous
input region below. Desktop and landscape views stay centered. Fitting accounts
for notches, the visible keyboard viewport, and actual dock height.

The dock's arrow collapses it to a fixed 52×52px square expand button with a
centered SVG icon. The mobile dock is horizontally centered; desktop stays top-right. The preference is saved;
collapsing releases pointer gestures, and the screen refits to the newly available space.
The dock stays at the visible top, above the desktop stream, including in embedded
Safari where the iframe may not report keyboard height. The VM reserves space
below it. Keyboard intent also compacts the dock without relying on viewport resize.
Its height is bounded by the visible space; panel contents scroll internally.
The collapsed button fills the entire square with a single transparent inner
button; no nested hover pill or native button background is drawn.
Click/Right/Drag/Fine remain available while typing. All joysticks are removed.

Mouse has one input-mode button, switching **Pad / Direct**. Saved Stick mode
migrates to Pad automatically. Pad makes the
video and empty space relative trackpads. Direct touches targets on the video
while keeping empty space as a relative trackpad. Swipe to move, tap to click,
and use two fingers to scroll/right-click. In empty space, hold ~550ms then swipe
to send arrow keys (one keypress per 16 CSS pixels), without moving or dragging
the mouse. Lift/cancel to stop. On the video, the existing hold-to-drag remains. Touch scrolling uses a scale-aware precision base and velocity-sensitive
acceleration: quick swipes receive up to 3.8× the slow-swipe gain. Flicking adds a
short, exponentially decaying momentum tail, bounded to 1.2 seconds. Resting the
fingers before lifting suppresses momentum for accurate stopping. New touches,
control actions, typing, mouse/wheel input, blur and input reset stop momentum.
A tap used to stop momentum does not accidentally click the remote application.
Momentum begins only after both fingers lift; two-finger right-click works in
both Pad and Direct modes. Direct-mode scrolling targets the pane under the
fingers. Ordinary desktop wheel scaling is unchanged; oversized input is drained
over frames so X11's wheel-event cap does not discard it. Captured gestures remain continuous
across video boundaries. Blank-area mouse movement/clicks/wheel also work on desktop.
Controls, local text fields and file dialogs are separate layers, not input regions.

Blank-space input works within Voxl's page, not empty space in a cross-origin
embedding parent. Arrow gestures preserve explicitly latched Ctrl/Alt/Super.

## Mobile controls

Trackpad is the default on coarse-pointer devices. The mode toggle switches to
Direct touch, and the preference is saved locally (when storage is available).
Mouse/trackpad hardware continues to use normal absolute pointer input.

The dock keeps the compact Click/Right/Drag/Fine action row in every mode.
Fine is on by default for slower trackpad movement; turn it off for faster travel.
The preference is saved locally. The on-screen marker is
a standard 18×24px arrow with its tip at the click location, not a circle. Toolbar labels have explicit
light text colors rather than inheriting the browser's default black.

| Gesture/control | Trackpad action |
| --- | --- |
| One-finger swipe | Move the remote cursor without clicking |
| Tap / two successive taps | Click / double-click at cursor |
| Hold ~550 ms, then swipe in empty space | Arrow-key navigation; lift to stop |
| Hold ~550 ms, then swipe on video | Hold left button and drag; lift to release |
| Two-finger tap | Right-click |
| Two-finger swipe | Scroll |
| Click / Right buttons | Explicit left/right click at cursor |
| Drag button | Toggle left-button hold across multiple swipes; tap again to release |
| Zoom | Cycle 1× / 1.5× / 2× / 3×; viewport follows the cursor while zoomed |
| Keyboard | Show/hide the system keyboard |
| ? | Gesture reference |

In Direct mode: tap a target to click, swipe to left-drag, long-press to right-click,
and use two fingers to scroll. Drag button switches to Trackpad mode.

The mobile toolbar wraps, has minimum 44px touch targets, and accounts for safe
areas and the keyboard's visual viewport. Desktop fitting reserves toolbar space.
Pointer cancellation, backgrounding, and focus loss release active gestures.

## i3 shortcut drawer

The **i3** tab opens a compact scrollable panel:

- Workspaces: **1 Terminal / 2 Web / 3 Files / 4 Misc**.
- Open terminal, a new managed Agent-profile browser window, files, or the app launcher.
- Focus left/up/down/right; tabbed/split/fullscreen; window picker.

Actions send explicit remote Alt key chords matching this VM's i3 config, bypassing
host-browser shortcut interception. Held pointer gestures/modifiers are cleared
before actions and modifiers are released afterward. **Close window** is near the top of the i3 tab, above workspace buttons, and
sends Alt+Shift+Q immediately without a Voxl confirmation dialog. No restart button is included. The i3 tab is hidden for read-only viewers and Mac remotes. Fine affects relative trackpad motion, not absolute mouse motion. There is no joystick.

## Mobile login sessions

One successful page login now issues an opaque, seven-day `HttpOnly; SameSite=Lax`
cookie (`Secure` on production/HTTPS hosts). The authenticated page also receives
an opaque session capability for its WebSocket and file requests, so embedded
Safari can work even when third-party cookies or Basic credential replay fail.
The password is not put in the capability or saved in localStorage.

Background authentication failures return 401 without a Basic challenge; only
opening the protected page can trigger the native login dialog. Authentication
is not disabled. Sessions are held in server memory and expire after seven days;
restarting Voxl revokes them, so reload and sign in once after a restart. iOS may
still require a fresh sign-in for a new standalone-app cookie store or a blocked
third-party page navigation; opening the stream directly avoids that restriction.

## macOS Option shortcuts

Browser Option+number events carry composed symbols such as `™`, not the physical
number. `keyboard.ts` resolves shortcut letters **and digits** using `event.code`,
while leaving AltGr text entry alone and preserving Shift for move-window chords.

This VM's current bindings: Option+1 terminal; Option+2 browser; Option+3 files;
Option+4 misc. Reload the browser page after updating the embedded client bundle.

## Validation

From this directory:

```sh
tsc --build web/tsconfig.json
node test-keyboard.mjs
node test-touch.mjs
node test-joystick.mjs
node test-background-trackpad.mjs
node test-clipboard-controls.mjs
node test-i3.mjs --live
cargo test --release
node test-login.mjs # live HTTP/cookie/embedded-session/socket authentication checks
# Live desktop/socket tests (temporarily change focus and restore it):
node test-workspaces.mjs
node test-caps.mjs
```

Browser smoke tests were also run at 390×844 and 1024×768 with a mocked worker and
coarse-pointer detection: toolbar bounds, 44px targets, relative movement without
clicks, click, latched drag/release, zoom, and Option+2 forwarding. They are not a
substitute for physical iPhone/iPad Safari testing, particularly installation,
software keyboard, orientation, and browser/OS-reserved gestures.

## Build/deploy in this VM

The Rust binary embeds all web assets; editing TypeScript alone does not update a
running server. Build with `cargo build --release`, atomically replace
`/home/drew/.cargo/bin/voxl`, restart `voxl-stream.service`, and reload the viewer.
The pre-mobile binary is saved as `/home/drew/.cargo/bin/voxl.before-mobile-pwa`.
The pre-joystick/auth-session binary is `/home/drew/.cargo/bin/voxl.before-joystick-auth`.
Restarting the stream does not restart the X display or desktop applications.
