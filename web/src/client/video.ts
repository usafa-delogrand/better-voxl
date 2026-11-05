// Presenting decoded frames and fitting the desktop to the window.
import type { Stripe, StripeFrame } from '../protocol';
import type { App } from './app';

interface StripeOut {
	video: HTMLVideoElement;
	writer: WritableStreamDefaultWriter<VideoFrame>;
	writing: boolean;
	next: VideoFrame | null;
}

/**
 * Prefer handing decoded frames to a <video> via MediaStreamTrackGenerator: the
 * compositor scans YUV out directly instead of rasterizing into a 2D canvas. One
 * <video> per encoded stripe, stacked; the worker hands over every stripe of a frame
 * in one message so they are written to their tracks together.
 */
// At most one write in flight per track; a newer frame replaces a waiting one.
function write(o: StripeOut, frame: VideoFrame) {
	if (o.writing) {
		o.next?.close();
		o.next = frame;
		return;
	}
	o.writing = true;
	o.writer
		.write(frame)
		.catch(() => {})
		.finally(() => {
			o.writing = false;
			const next = o.next;
			if (next) {
				o.next = null;
				write(o, next);
			}
		});
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function createVideo(
	app: App,
	canvas: HTMLCanvasElement,
	useVideo: boolean,
	onLayout: () => void
) {
	let outs: StripeOut[] = [];
	let stripes: Stripe[] = [[0, 1]];
	if (useVideo) canvas.style.display = 'none';

	function build(list: Stripe[]) {
		stripes = list;
		for (const o of outs) o.video.remove();
		outs = [];
		if (!useVideo) return;
		for (const [y, h] of list) {
			const gen = new MediaStreamTrackGenerator({ kind: 'video' });
			const video = document.createElement('video');
			video.className = 'stripe';
			video.muted = true;
			video.autoplay = true;
			video.playsInline = true;
			video.disablePictureInPicture = true;
			video.style.top = `${(y / app.desk.h) * 100}%`;
			video.style.height = `${(h / app.desk.h) * 100}%`;
			video.srcObject = new MediaStream([gen]);
			app.surface.appendChild(video);
			video.play().catch(() => {});
			outs.push({
				video,
				writer: gen.writable.getWriter(),
				writing: false,
				next: null,
			});
		}
	}

	function present(parts: StripeFrame[]) {
		for (const p of parts) {
			const o = outs[p.i];
			if (o) write(o, p.frame);
			else p.frame.close();
		}
	}

	function layout() {
		const { w: dw, h: dh } = app.desk;
		if (!dw) return;
		const viewport = window.visualViewport;
		const mobile = matchMedia('(pointer: coarse)').matches;
		const styles = getComputedStyle(document.documentElement);
		const inset = (name: string) => mobile ? parseFloat(styles.getPropertyValue(`--safe-${name}`)) || 0 : 0;
		const safeLeft = inset('left'), safeRight = inset('right'), safeTop = inset('top');
		const safeBottom = app.tools.classList.contains('keyboard-open') ? 0 : inset('bottom');
		const rawWidth = viewport?.width || window.innerWidth, rawHeight = viewport?.height || window.innerHeight;
		const vw = Math.max(1, rawWidth - safeLeft - safeRight);
		const toolbar = mobile ? app.tools.getBoundingClientRect().height + 16 : 0;
		const vh = Math.max(1, rawHeight - toolbar - safeTop - safeBottom - (mobile ? 24 : 0));
		const dpr = window.devicePixelRatio || 1;
		// Snap the height so every stripe boundary lands on a whole device pixel;
		// otherwise the stacked stripe layers show hairline seams.
		const q = dh / stripes.reduce((g, [y]) => gcd(g, y), dh);
		const devH = Math.max(
			q,
			Math.floor(((Math.min(vw / dw, vh / dh) || 1) * app.view.zoom * dh * dpr) / q) * q
		);
		app.view.scale = devH / dpr / dh;
		app.surface.style.width = `${dw * app.view.scale}px`;
		app.surface.style.height = `${dh * app.view.scale}px`;
		app.surface.style.position = 'fixed';
		const sw = dw * app.view.scale, sh = dh * app.view.scale;
		const pan = (size: number, available: number, focus: number) => size <= available
			? (available - size) / 2
			: Math.max(available - size, Math.min(0, available / 2 - focus * size));
		const portrait = mobile && rawHeight > rawWidth * 1.1;
		// Mobile reserves the top strip for the dock, including in an iframe whose
		// viewport does not shrink for the iPad keyboard. Desktop stays centered.
		const vertical = portrait && sh <= vh ? Math.min(12, (vh - sh) / 2) : pan(sh, vh, app.view.y);
		app.surface.style.left = `${(viewport?.offsetLeft || 0) + safeLeft + pan(sw, vw, app.view.x)}px`;
		app.surface.style.top = `${(viewport?.offsetTop || 0) + safeTop + toolbar + (mobile ? 12 : 0) + vertical}px`;
		onLayout();
	}

	return { build, present, layout };
}
