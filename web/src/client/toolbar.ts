// Toolbar (top right on hover; bottom right and always visible on touch devices):
// on-screen keyboard, files, microphone and fullscreen buttons.
import type { App } from './app';
import { el } from './app';
import { setupI3 } from './i3';
import { setupControlTabs } from './controls';
import { setupClipboardControls } from './clipboard-controls';
import type { Clipboard } from './clipboard';
import { setupModifiers } from './modifiers';

export function setupToolbar(app: App, onFullscreenChange: () => void, clipboard: Clipboard) {
	const { tools, kbd } = app;
	setupI3(app, onFullscreenChange);
	setupModifiers(app);
	const kbBtn = el<HTMLButtonElement>('kb-btn');
	const fsBtn = el<HTMLButtonElement>('fs-btn');
	const zoomBtn = el('zoom-btn');
	zoomBtn.addEventListener('click', () => {
		const levels = [1, 1.5, 2, 3];
		app.view.zoom = levels[(levels.indexOf(app.view.zoom) + 1) % levels.length];
		zoomBtn.textContent = `Zoom ${app.view.zoom}×`;
		onFullscreenChange();
	});
	el('help-btn').addEventListener('click', () => alert(
		'The input-mode button switches Pad and Direct. Swipe blank space to move the mouse; hold briefly then swipe to send arrow keys. Tap to left-click, two-finger tap to right-click, and two-finger swipe to scroll. Fine gives slower, precise mouse movement. Use Click / Right / Drag for explicit mouse actions. The dock arrow collapses all controls. The i3 tab has workspace, close-window, launcher, focus, and layout buttons.\n\nTrackpad: swipe one finger to move the cursor; tap to click; tap twice to double-click. Hold for half a second, then swipe to drag. Two-finger tap: right-click. Two-finger swipe: scroll.\n\nDrag button: hold the left mouse button across multiple swipes; tap Drag again to release. Click / Right act at the cursor.\n\nDirect mode: tap the target, swipe to drag, hold to right-click. Use Keyboard to show or hide the on-screen keyboard. Zoom cycles through 1×, 1.5×, 2×, and 3×; in Trackpad mode the view follows the cursor. Touch mode is saved on this device.'
	));
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	function show(ms: number) {
		tools.classList.add('show');
		clearTimeout(hideTimer);
		if (ms) hideTimer = setTimeout(() => tools.classList.remove('show'), ms);
	}
	// Touch devices keep the toolbar visible; mice reveal it near the top edge.
	if (matchMedia('(pointer: coarse)').matches) {
		tools.classList.add('touch');
		show(0);
	} else
		document.addEventListener('pointermove', (e) => {
			if (
				e.pointerType === 'mouse' &&
				e.clientY < 48 &&
				e.clientX > window.innerWidth - 160
			)
				show(2500);
		});
	// Clicks on the toolbar must not reach the desktop surface underneath.
	for (const b of tools.querySelectorAll<HTMLElement>('button, summary'))
		b.addEventListener('pointerdown', (e) => {
			e.preventDefault(); // Keep the software keyboard focused; click still acts.
			e.stopPropagation();
		});

	kbBtn.addEventListener('click', () => {
		if (document.activeElement === kbd && kbd.dataset.soft) {
			kbd.blur();
			delete kbd.dataset.soft;
			kbBtn.setAttribute('aria-pressed', 'false');
		} else {
			kbd.dataset.soft = '1';
			kbd.focus({ preventScroll: true });
			kbBtn.setAttribute('aria-pressed', 'true');
		}
		app.surface.dispatchEvent(new Event('voxl-keyboard-change'));
	});

	if (!document.fullscreenEnabled) fsBtn.style.display = 'none';
	fsBtn.addEventListener('click', () => {
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
		else
			document.documentElement
				.requestFullscreen({ navigationUI: 'hide' })
				.catch(() => {});
	});
	// In fullscreen, capture browser shortcuts (Cmd/Ctrl+W, T, L, ...) for the desktop.
	// Keyboard Lock is Chromium-only and only allowed for the top-level page (an
	// embedding page has to lock on our behalf); hold Esc to leave fullscreen.
	document.addEventListener('fullscreenchange', () => {
		const kl = navigator.keyboard;
		if (document.fullscreenElement) kl?.lock().catch(() => {});
		else kl?.unlock();
		fsBtn.classList.toggle('on', !!document.fullscreenElement);
		onFullscreenChange();
	});
	setupClipboardControls(app, clipboard);
	setupControlTabs(app, onFullscreenChange);
}
