// Direct touch or a relative trackpad. Trackpad: swipe to move, tap to click,
// hold then move to drag, two-finger tap to right-click, two-finger swipe to scroll.
import { cmd } from '../protocol';
import type { App } from './app';
import { createTouchScroll } from './touch-scroll';

const SLOP = 10;
const SCROLL_SLOP = 6;
const LONG_PRESS = 550;
interface Hooks {
	moveTo(x: number, y: number): void;
	moveBy(dx: number, dy: number): void;
	queueScroll(dx: number, dy: number): void;
	cancelScroll?(): void;
	deskPerPx(): number;
	isTrackpad(): boolean;
	isDragging(): boolean;
	/** Hold then swipe in blank space for terminal-style arrow navigation. */
	holdArrows?(): boolean;
	captureTarget?(): HTMLElement;
}

export function createTouch(app: App, hooks: Hooks) {
	const pts = new Map<number, { x: number; y: number }>();
	let mode: 'pending' | 'move' | 'drag' | 'scroll' | 'arrows' | 'done' | null = null;
	let start = { x: 0, y: 0 };
	let timer: ReturnType<typeof setTimeout> | undefined;
	let scrollStart: [number, number] = [0, 0];
	let scrolled = false;
	let flingPending = false;
	let suppressTap = false;
	const scrolling = createTouchScroll({
		emit: (dx, dy) => hooks.queueScroll(dx, dy),
		scale: () => Math.max(3, hooks.deskPerPx() * 2.25),
		clearPending: () => hooks.cancelScroll?.(),
	});
	const mid = (): [number, number] => {
		let x = 0, y = 0;
		for (const p of pts.values()) { x += p.x; y += p.y; }
		return [x / pts.size, y / pts.size];
	};
	const click = (button: number) => {
		app.send(cmd.button(button, true));
		app.send(cmd.button(button, false));
	};
	function reset() {
		scrolling.cancel();
		flingPending = suppressTap = false;
		clearTimeout(timer);
		if (mode === 'drag') app.send(cmd.button(1, false));
		pts.clear();
		mode = null;
	}
	function down(e: PointerEvent) {
		const stoppingMomentum = scrolling.coasting();
		scrolling.cancel();
		flingPending = false;
		try { (hooks.captureTarget?.() || app.surface).setPointerCapture(e.pointerId); } catch {}
		pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pts.size === 1) {
			suppressTap = stoppingMomentum;
			mode = hooks.isDragging() ? 'move' : 'pending';
			start = { x: e.clientX, y: e.clientY };
			if (hooks.isDragging()) return;
			timer = setTimeout(() => {
				if (mode !== 'pending') return;
				if (hooks.holdArrows?.()) {
					mode = 'arrows';
					const p = [...pts.values()][0];
					if (p) start = { ...p };
				} else if (hooks.isTrackpad()) {
					mode = 'drag';
					app.send(cmd.button(1, true));
				} else {
					hooks.moveTo(start.x, start.y);
					click(3);
					mode = 'done';
				}
				navigator.vibrate?.(10);
			}, LONG_PRESS);
		} else if (pts.size === 2) {
			clearTimeout(timer);
			if (mode === 'drag') app.send(cmd.button(1, false));
			mode = 'scroll';
			scrollStart = mid();
			if (!hooks.isTrackpad()) hooks.moveTo(...scrollStart);
			scrolling.begin(scrollStart, e.timeStamp);
			scrolled = false;
		} else {
			// Additional fingers cancel the gesture rather than leaking a click.
			clearTimeout(timer);
			mode = 'done';
		}
	}
	function move(e: PointerEvent) {
		const p = pts.get(e.pointerId);
		if (!p) return;
		const dx = e.clientX - p.x, dy = e.clientY - p.y;
		p.x = e.clientX; p.y = e.clientY;
		if (mode === 'arrows') {
			const step = 16;
			const nx = Math.max(-32, Math.min(32, Math.trunc((p.x - start.x) / step)));
			const ny = Math.max(-32, Math.min(32, Math.trunc((p.y - start.y) / step)));
			for (const [count, key] of [[nx, nx < 0 ? 0xff51 : 0xff53], [ny, ny < 0 ? 0xff52 : 0xff54]])
				for (let i = 0; i < Math.abs(count); i++) {
					app.send(cmd.key(key, true));
					app.send(cmd.key(key, false));
				}
			start.x += nx * step; start.y += ny * step;
			return;
		}
		if (mode === 'pending' && Math.hypot(p.x - start.x, p.y - start.y) > SLOP) {
			clearTimeout(timer);
			mode = hooks.isTrackpad() ? 'move' : 'drag';
			if (mode === 'drag') {
				hooks.moveTo(start.x, start.y);
				app.send(cmd.button(1, true));
			} else {
				hooks.moveBy(p.x - start.x, p.y - start.y);
				return;
			}
		}
		if (mode === 'drag' || mode === 'move') {
			if (hooks.isTrackpad()) hooks.moveBy(dx, dy);
			else hooks.moveTo(p.x, p.y);
		} else if (mode === 'scroll' && pts.size >= 2) {
			const m = mid();
			if (!scrolled && Math.hypot(m[0] - scrollStart[0], m[1] - scrollStart[1]) > SCROLL_SLOP) scrolled = true;
			if (scrolled) scrolling.move(m, e.timeStamp);
		}
	}
	function up(e: PointerEvent) {
		if (!pts.delete(e.pointerId)) return;
		clearTimeout(timer);
		if (mode === 'pending') {
			if (!suppressTap) {
				if (!hooks.isTrackpad()) hooks.moveTo(start.x, start.y);
				click(1);
			}
			mode = 'done';
		} else if (mode === 'drag') {
			app.send(cmd.button(1, false));
			mode = 'done';
		} else if (mode === 'scroll' && pts.size < 2) {
			if (!scrolled && !suppressTap) click(3);
			flingPending = scrolled;
			mode = 'done';
		}
		if (pts.size === 0) {
			if (flingPending) scrolling.end(e.timeStamp);
			flingPending = suppressTap = false;
			mode = null;
		}
	}
	function cancel(e: PointerEvent) {
		if (pts.has(e.pointerId)) reset();
	}
	const stopMomentum = () => { if (scrolling.coasting()) scrolling.cancel(); };
	return { down, move, up, cancel, reset, stopMomentum };
}
