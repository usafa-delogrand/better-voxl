// Main thread: layout, input capture, cursor, clipboard, files, microphone and audio.
// Video decode/paint and the socket live in the worker (worker.ts).
import type { FromWorker, ToWorker } from '../protocol';
import type { App } from './app';
import { el } from './app';
import { createAudio } from './audio';
import { createClipboard } from './clipboard';
import { createCursor } from './cursor';
import { createFiles } from './files';
import { setupKeyboard } from './keyboard';
import { createMic } from './mic';
import { setupPointer } from './pointer';
import { setupPwa } from './pwa';
import { pageSession } from './session';
import { setupSessions } from './sessions';
import { createResize } from './resize';
import { setupToolbar } from './toolbar';
import { createVideo } from './video';
import { viewportBounds } from './viewport';

/**
 * Commands a read-only viewer sends: acks, video and audio on/off, keyframe requests
 * and ping replies. Anything else would act on the desktop (input, clipboard,
 * microphone, resizing). The server accepts only these from read-only viewers too
 * (READ_ONLY_COMMANDS in server.rs), so a page that ignores the hello flag cannot
 * drive the desktop either; this keeps it from sending what would be dropped.
 */
const READ_ONLY_COMMANDS = new Set(['a', 'v', 'au', 'kf', 'po', 'sessions']);

function blocksInput(app: App, command: string): boolean {
	return app.readOnly && !READ_ONLY_COMMANDS.has(command.split(',')[0]);
}

function main() {
	const canvas = el<HTMLCanvasElement>('screen');
	const statusEl = el('status');
	const statsEl = el('stats');
	const params = new URLSearchParams(location.search);
	window.fps = 0;
	window.voxlStats = {};

	// Browsers only offer WebCodecs on HTTPS pages and localhost, so a page opened over
	// plain HTTP from another machine can't decode the stream whatever the browser.
	if (!window.isSecureContext) {
		statusEl.textContent =
			'voxl needs HTTPS or localhost: browsers only decode video on secure pages. Serve it over HTTPS, or forward the port and open localhost.';
		return;
	}
	if (!('VideoDecoder' in window) || !canvas.transferControlToOffscreen) {
		statusEl.textContent =
			'This browser lacks WebCodecs/OffscreenCanvas support.';
		return;
	}

	const wsUrl = new URL('ws', location.href);
	wsUrl.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	wsUrl.search = location.search;
	if (pageSession) {
		wsUrl.searchParams.delete('token');
		wsUrl.searchParams.set('session', pageSession);
	}
	const worker = new Worker('worker.js');
	const post = (m: ToWorker, transfer: Transferable[] = []) =>
		worker.postMessage(m, transfer);
	const app: App = {
		worker,
		post,
		send: (d) => {
			if (!blocksInput(app, d)) post({ t: 'send', d });
		},
		sendBin: (type, bytes) => {
			// The server drops every binary message from read-only viewers.
			if (app.readOnly) return;
			const msg = new Uint8Array(bytes.byteLength + 1);
			msg[0] = type;
			msg.set(bytes, 1);
			post({ t: 'sendBin', d: msg.buffer }, [msg.buffer]);
		},
		surface: el('surface'),
		kbd: el<HTMLTextAreaElement>('kbd'),
		tools: el('tools'),
		isMac: /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
		remoteMac: false,
		modifiers: new Set(),
		readOnly: false,
		inIframe: window !== window.top,
		desk: { w: 0, h: 0 },
		view: { scale: 1, zoom: 1, x: 0.5, y: 0.5 },
	};

	const cursor = createCursor(app);
	const useVideo =
		params.get('present') !== 'canvas' &&
		typeof MediaStreamTrackGenerator !== 'undefined';
	const video = createVideo(app, canvas, useVideo, cursor.apply);
	const clipboard = createClipboard(app);
	const audio = createAudio(app);
	// Browsers only allow audio and clipboard writes after a user gesture.
	const onInteract = () => {
		audio.start();
		clipboard.flush();
	};
	setupPointer(app, onInteract);
	setupKeyboard(app, clipboard, onInteract);
	setupToolbar(app, video.layout, clipboard);
	setupSessions(app);
	app.surface.addEventListener('voxl-layout', video.layout);
	setupPwa();
	// iOS's keyboard changes the visual viewport without resizing the layout viewport.
	const viewport = window.visualViewport;
	const fitViewport = () => {
		const bounds = viewportBounds(viewport, window.innerWidth, window.innerHeight);
		const focused = document.activeElement;
		// Embedded Safari may not report the parent keyboard in visualViewport.
		const typing = focused === app.kbd ? !!app.kbd.dataset.soft :
			focused instanceof HTMLTextAreaElement || (focused instanceof HTMLInputElement &&
				['text', 'search', 'email', 'url', 'tel', 'number', 'password'].includes(focused.type));
		const keyboardOpen = bounds.keyboardOpen || (app.tools.classList.contains('touch') && typing);
		const opening = keyboardOpen && !app.tools.classList.contains('keyboard-open');
		app.tools.classList.toggle('keyboard-open', keyboardOpen);
		for (const name of ['width', 'height', 'left', 'top', 'bottom'] as const)
			document.documentElement.style.setProperty(`--viewport-${name}`, `${bounds[name]}px`);
		if (opening) app.surface.dispatchEvent(new Event('voxl-release-pointer'));
		video.layout();
	};
	viewport?.addEventListener('resize', fitViewport);
	viewport?.addEventListener('scroll', fitViewport);
	document.addEventListener('focusin', fitViewport);
	document.addEventListener('focusout', fitViewport);
	app.surface.addEventListener('voxl-keyboard-change', fitViewport);
	new ResizeObserver(() => video.layout()).observe(app.tools);
	fitViewport();
	const files = createFiles(app);
	const mic = createMic(app);
	const resize = createResize(app);

	const offscreen = canvas.transferControlToOffscreen();
	post(
		{ t: 'init', canvas: offscreen, url: wsUrl.href, presentToMain: useVideo },
		[offscreen]
	);

	// Stop video when nobody can see it.
	let videoOn: boolean | null = null;
	function updateVisibility(force = false) {
		const on =
			!document.hidden && window.innerWidth > 0 && window.innerHeight > 0;
		if (on !== videoOn || force) {
			videoOn = on;
			post({ t: 'video', on });
		}
	}
	document.addEventListener('visibilitychange', () => {
		updateVisibility();
		if (document.hidden) app.surface.dispatchEvent(new Event('voxl-release-input'));
	});
	window.addEventListener('resize', () => {
		fitViewport();
		updateVisibility();
	});
	updateVisibility();

	worker.addEventListener('message', (e: MessageEvent<FromWorker>) => {
		const m = e.data;
		switch (m.t) {
			case 'frames':
				video.present(m.parts);
				break;
			case 'hello':
				app.desk.w = m.w;
				app.desk.h = m.h;
				app.remoteMac = m.os === 'macos';
				app.tools.classList.toggle('remote-mac', app.remoteMac);
				app.readOnly = !!m.readOnly;
				app.tools.classList.toggle('read-only', app.readOnly);
				app.surface.dispatchEvent(new Event('voxl-controls-update'));
				video.build(m.stripes && m.stripes.length ? m.stripes : [[0, m.h]]);
				video.layout();
				files.setup(m.files);
				mic.setup(!!m.mic && !app.readOnly);
				resize.setup(m.resize);
				statusEl.style.display = 'none';
				break;
			case 'status':
				if (m.s === 'closed' || m.s === 'disconnected') {
					mic.stop();
					statusEl.style.display = '';
					statusEl.textContent = m.s === 'disconnected' ? 'Session disconnected. You can close this tab.' : 'Reconnecting…';
					if (m.s === 'disconnected') {
						// The server has already closed the socket and removed this viewer.
						// Script-opened tabs can close; manually opened tabs may be blocked.
						worker.terminate();
						try { window.close(); } catch {}
					}
				}
				if (m.s === 'open') updateVisibility(true);
				break;
			case 'cursor':
				cursor.set(m.buf);
				break;
			case 'clip':
				clipboard.onRemoteText(m.d);
				break;
			case 'clipImage':
				clipboard.onRemoteImage(m.buf);
				break;
			case 'mic':
				if (!m.on) mic.stop();
				break;
			case 'stats':
				window.fps = Math.round(m.fps);
				window.voxlStats = m;
				if (params.has('stats')) {
					statsEl.style.display = 'block';
					statsEl.textContent =
						`${m.fps.toFixed(1)} fps  ${(m.kbps / 1000).toFixed(2)} Mbps\n` +
						`decode ${m.decodeMs.toFixed(1)} ms  server ${m.pipeMs.toFixed(1)} ms\n${m.codec || ''} q=${m.queue}`;
				}
				break;
			case 'log':
				console.warn('[voxl]', m.s);
				break;
		}
	});

	// Autoplay may be allowed (iframe allow="autoplay"); try right away.
	audio.start();
}

main();
