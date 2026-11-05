import { cmd } from '../protocol';
import type { App } from './app';
import type { Clipboard } from './clipboard';
import { sendI3Chord as sendChord } from './i3';

export function setupClipboardControls(app: App, clipboard: Clipboard) {
	const get = (id: string) => document.getElementById(id)!;
	const local = get('clipboard-local') as HTMLTextAreaElement;
	const remote = get('clipboard-remote') as HTMLTextAreaElement;
	const status = get('clipboard-status');
	let terminal = false;
	const terminalBtn = get('terminal-clipboard-btn');
	const tell = (message: string, error = false) => {
		status.textContent = message;
		status.classList.toggle('error', error);
	};
	function chord(keys: number[]) {
		if (app.readOnly) return;
		app.surface.dispatchEvent(new Event('voxl-release-input'));
		sendChord(app.send, keys);
	}
	function shortcut(letter: string) {
		const modifier = app.remoteMac ? 0xffeb : 0xffe3;
		chord(terminal && !app.remoteMac ? [modifier, 0xffe1, letter.charCodeAt(0)] : [modifier, letter.charCodeAt(0)]);
	}
	terminalBtn.addEventListener('click', () => {
		terminal = !terminal;
		terminalBtn.classList.toggle('on', terminal);
		terminalBtn.setAttribute('aria-pressed', String(terminal));
		terminalBtn.textContent = '>_';
	});
	for (const button of app.tools.querySelectorAll<HTMLButtonElement>('[data-remote-key]')) {
		button.addEventListener('click', () => {
			if (app.readOnly) return;
			const value = button.dataset.remoteKey!;
			if (value.startsWith('ctrl-')) chord([0xffe3, value.charCodeAt(5)]);
			else {
				const key = Number(value);
				if (!Number.isInteger(key) || key <= 0) return;
				// Arrow/Esc taps must preserve latched Ctrl/Alt/Super.
				app.surface.dispatchEvent(new Event('voxl-release-pointer'));
				app.send(cmd.key(key, true));
				app.send(cmd.key(key, false));
			}
		});
	}
	get('copy-selection-btn').addEventListener('click', () => {
		shortcut('c'); tell('Copy requested. Remote text will appear below when the VM reports it.');
	});
	get('cut-selection-btn').addEventListener('click', () => {
		if (terminal) { tell('Cut is unavailable in Terminal mode.', true); return; }
		shortcut('x'); tell('Cut requested. Remote text will appear below.');
	});
	get('paste-remote-btn').addEventListener('click', () => {
		shortcut('v'); tell('Pasted the VM clipboard.');
	});
	get('paste-device-btn').addEventListener('click', async () => {
		if (app.readOnly) return;
		try {
			if (!navigator.clipboard?.readText) throw new Error('Clipboard unavailable');
			const text = await navigator.clipboard.readText();
			local.value = text;
			app.send(cmd.clipboard(text)); clipboard.noteLocal(text); shortcut('v');
			tell('Device clipboard sent and pasted into the VM.');
		} catch {
			tell('Paste text below, then tap Send & paste.', true);
			const section = local.closest('details');
			if (section) section.open = true;
			local.focus();
		}
	});
	get('send-clipboard-btn').addEventListener('click', () => {
		if (app.readOnly) return;
		app.send(cmd.clipboard(local.value)); clipboard.noteLocal(local.value); shortcut('v');
		tell('Text sent and pasted into the VM.');
	});
	get('copy-device-btn').addEventListener('click', async () => {
		try {
			if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
			await navigator.clipboard.writeText(clipboard.getText());
			tell('Remote text copied to this device.');
		} catch {
			const section = remote.closest('details');
			if (section) section.open = true;
			remote.focus(); remote.select();
			tell('Use system Copy on the selected text.', true);
		}
	});
	remote.value = clipboard.getText();
	app.surface.addEventListener('voxl-clipboard', e => {
		remote.value = (e as CustomEvent<string>).detail;
		tell('Remote clipboard updated. Tap Copy to device to copy it locally.');
	});
}
