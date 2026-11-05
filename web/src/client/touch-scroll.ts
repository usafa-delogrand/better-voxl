// Touch scrolling: velocity-sensitive gain and a short, interruptible fling.
// All speeds are CSS px/ms until scaled to desktop pixels at the output.
export function scrollAcceleration(speed: number): number {
	const t = Math.max(0, Math.min(1, (speed - 0.25) / 1.5));
	return 1 + 2.8 * t * t * (3 - 2 * t);
}

interface Hooks {
	emit(dx: number, dy: number): void;
	scale(): number;
	clearPending?(): void;
}
interface Clock {
	now(): number;
	request(callback: FrameRequestCallback): number;
	cancel(id: number): void;
}
const browserClock: Clock = {
	now: () => performance.now(),
	request: callback => requestAnimationFrame(callback),
	cancel: id => cancelAnimationFrame(id),
};

export function createTouchScroll(hooks: Hooks, clock: Clock = browserClock) {
	let x = 0, y = 0, lastTime = 0;
	let vx = 0, vy = 0, sampled = false;
	let frame = 0, generation = 0;
	const stamp = (time: number) => Number.isFinite(time) ? time : clock.now();
	function cancel() {
		generation++;
		if (frame) clock.cancel(frame);
		frame = 0;
		vx = vy = 0;
		sampled = false;
		hooks.clearPending?.();
	}
	function begin(point: [number, number], time: number) {
		cancel();
		[x, y] = point;
		lastTime = stamp(time);
	}
	function move(point: [number, number], time: number) {
		const now = stamp(time), dt = Math.max(4, now - lastTime);
		const dx = x - point[0], dy = y - point[1];
		x = point[0]; y = point[1]; lastTime = now;
		if (!dx && !dy) return;
		const rx = dx / dt, ry = dy / dt;
		const alpha = 1 - Math.exp(-dt / 30);
		vx = !sampled || vx * rx < 0 ? rx : vx + (rx - vx) * alpha;
		vy = !sampled || vy * ry < 0 ? ry : vy + (ry - vy) * alpha;
		sampled = true;
		const gain = hooks.scale() * scrollAcceleration(Math.hypot(rx, ry));
		hooks.emit(dx * gain, dy * gain);
	}
	function end(time: number) {
		if (!sampled) return;
		const pause = Math.max(0, stamp(time) - lastTime);
		// Resting before lifting should stop precisely rather than launch a stale fling.
		if (pause > 120) return;
		const fade = Math.exp(-pause / 60);
		let sx = vx * fade, sy = vy * fade;
		const speed = Math.hypot(sx, sy);
		if (speed < 0.25) return;
		const gain = hooks.scale() * scrollAcceleration(speed);
		sx *= gain; sy *= gain;
		const limit = Math.min(1, 12 / Math.hypot(sx, sy));
		sx *= limit; sy *= limit;
		const token = ++generation;
		let previous = clock.now();
		const deadline = previous + 1200;
		function tick(now: number) {
			if (token !== generation) return;
			frame = 0;
			const dt = Math.max(0, Math.min(50, now - previous, deadline - previous));
			previous = Math.min(now, deadline);
			const decay = Math.exp(-dt / 220);
			if (dt) hooks.emit(sx * 220 * (1 - decay), sy * 220 * (1 - decay));
			sx *= decay; sy *= decay;
			if (now >= deadline || Math.hypot(sx, sy) < 0.04) return;
			frame = clock.request(tick);
		}
		frame = clock.request(tick);
	}
	return { begin, move, end, cancel, coasting: () => frame !== 0 };
}
