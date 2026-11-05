// Shortcuts for this VM's i3 config (Alt/Mod1). These are explicit remote key
// chords, so the host browser/OS never has to forward a physical shortcut.
import { cmd } from '../protocol';
import type { App } from './app';

const ALT = 0xffe9, SHIFT = 0xffe1;
export const I3_ACTIONS: Record<string, number[]> = {
	terminal: [ALT, 0xff0d], browser: [ALT, 0x62], files: [ALT, SHIFT, 0x65],
	dropdown: [ALT, 0x60], launcher: [ALT, 0x64], picker: [ALT, 0xff09],
	left: [ALT, 0xff51], up: [ALT, 0xff52], down: [ALT, 0xff54], right: [ALT, 0xff53],
	tabbed: [ALT, 0x77], split: [ALT, 0x65], fullscreen: [ALT, 0x66],
	close: [ALT, SHIFT, 0x71],
};

export function sendI3Chord(send: (command: string) => void, keys: number[]) {
	send(cmd.releaseAll);
	try {
		for (const key of keys) send(cmd.key(key, true));
	} finally {
		for (const key of [...keys].reverse()) send(cmd.key(key, false));
		send(cmd.releaseAll);
	}
}

export function setupI3(app: App, layout: () => void) {
	const toggle = document.getElementById('i3-btn')!;
	const panel = document.getElementById('i3-panel')!;
	function run(keys: number[]) {
		if (app.readOnly || app.remoteMac) return;
		app.surface.dispatchEvent(new Event('voxl-release-input'));
		sendI3Chord(app.send, keys);
	}
	toggle.addEventListener('click', () => {
		panel.hidden = !panel.hidden;
		toggle.setAttribute('aria-expanded', String(!panel.hidden));
		toggle.classList.toggle('on', !panel.hidden);
		app.tools.classList.toggle('i3-open', !panel.hidden);
		layout();
	});
	for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-workspace]')) {
		button.addEventListener('click', () => {
			const n = Number(button.dataset.workspace);
			if (n < 1 || n > 4) return;
			run([ALT, 0x30 + n]);
		});
	}
	for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-i3]')) {
		button.addEventListener('click', () => {
			const action = button.dataset.i3!;
			const keys = I3_ACTIONS[action];
			if (keys) run(keys);
		});
	}
}
