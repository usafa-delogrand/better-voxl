// Rate-controlled thumb stick: dead zone for precision, progressive acceleration,
// and frame-time-based movement so speed is independent of display refresh rate.
const TRAVEL = 34;
const DEAD_ZONE = 0.16;
const MAX_SPEED = 600; // CSS pixels/sec, scaled by the pointer module to the desktop.

export function joystickVelocity(x: number, y: number): [number, number] {
	const length = Math.hypot(x, y);
	if (length <= DEAD_ZONE) return [0, 0];
	const push = (Math.min(1, length) - DEAD_ZONE) / (1 - DEAD_ZONE);
	// Preserve fine aiming near the center; add travel speed toward the outer rim.
	const speed = 260 * Math.pow(push, 2.4) + (MAX_SPEED - 260) * Math.pow(push, 6);
	return [x / length * speed, y / length * speed];
}

export function setupJoystick(
	stick: HTMLElement,
	moveBy: (dx: number, dy: number) => void,
	onInteract: () => void,
	onStop: () => void = () => {},
	options: { captureTarget?: HTMLElement; bindPointerEvents?: boolean } = {}
) {
	let pointer: number | null = null;
	let origin: [number, number] = [0, 0];
	let vector: [number, number] = [0, 0];
	let frame = 0;
	let lastTime: number | null = null;
	function stop() {
		const held = pointer;
		pointer = null;
		vector = [0, 0];
		cancelAnimationFrame(frame);
		frame = 0;
		lastTime = null;
		stick.style.setProperty('--stick-x', '0px');
		stick.style.setProperty('--stick-y', '0px');
		stick.classList.remove('active');
		if (held !== null && options.bindPointerEvents !== false) {
			try { (options.captureTarget || stick).releasePointerCapture(held); } catch {}
		}
		onStop();
	}
	function tick(time: number) {
		if (pointer === null) return;
		const dt = lastTime === null ? 0 : Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
		lastTime = time;
		const [vx, vy] = joystickVelocity(...vector);
		if (dt && (vx || vy)) moveBy(vx * dt, vy * dt);
		frame = requestAnimationFrame(tick);
	}
	function update(e: PointerEvent) {
		const rect = stick.getBoundingClientRect();
		// Match the compact base while keeping the thumb inside its rim.
		const travel = Math.max(8, Math.min(TRAVEL, (Math.min(rect.width, rect.height) - 34) / 2));
		let x = (e.clientX - origin[0]) / travel;
		let y = (e.clientY - origin[1]) / travel;
		const length = Math.hypot(x, y);
		if (length > 1) { x /= length; y /= length; }
		vector = [x, y];
		stick.style.setProperty('--stick-x', `${x * travel}px`);
		stick.style.setProperty('--stick-y', `${y * travel}px`);
	}
	function start(e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (pointer !== null || e.button !== 0) return;
		onInteract();
		pointer = e.pointerId;
		// Treat the initial contact as neutral. A thumb need not hit the exact
		// visual center, and merely touching the stick must never move the cursor.
		origin = [e.clientX, e.clientY];
		try { (options.captureTarget || stick).setPointerCapture(pointer); } catch {}
		stick.classList.add('active');
		update(e);
		frame = requestAnimationFrame(tick);
	}
	if (options.bindPointerEvents !== false) stick.addEventListener('pointerdown', start);
	function move(e: PointerEvent) {
		if (e.pointerId !== pointer) return;
		e.preventDefault();
		update(e);
	}
	function end(e: PointerEvent) { if (e.pointerId === pointer) stop(); }
	if (options.bindPointerEvents !== false) {
		stick.addEventListener('pointermove', move);
		for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
			stick.addEventListener(type, end);
	}
	stick.addEventListener('contextmenu', e => e.preventDefault());
	stick.addEventListener('keydown', e => {
		const arrows: Record<string, [number, number]> = {
			ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12],
		};
		if (!arrows[e.key]) return;
		e.preventDefault();
		e.stopPropagation();
		onInteract();
		moveBy(...arrows[e.key]);
	});
	window.addEventListener('blur', stop);
	document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
	return { stop, start, move, end, active: () => pointer !== null };
}
