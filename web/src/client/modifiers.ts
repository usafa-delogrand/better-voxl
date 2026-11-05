// Latched modifiers for software keyboards and modified mouse clicks.
import { cmd } from '../protocol';
import type { App } from './app';

export function setupModifiers(app: App) {
	const keys: Record<string, number> = { ctrl: 0xffe3, alt: 0xffe9, super: 0xffeb };
	const buttons = [...app.tools.querySelectorAll<HTMLButtonElement>('[data-modifier]')];
	function paint() {
		app.tools.classList.toggle('modifiers-on', app.modifiers.size > 0);
		for (const button of buttons) {
			const on = app.modifiers.has(keys[button.dataset.modifier!]);
			button.classList.toggle('on', on);
			button.setAttribute('aria-pressed', String(on));
		}
	}
	function clear() { app.modifiers.clear(); paint(); }
	function release() {
		for (const key of app.modifiers) app.send(cmd.key(key, false));
		clear();
	}
	for (const button of buttons) {
		// Keep an open software keyboard focused while toggling a modifier.
		button.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
		button.addEventListener('click', () => {
			if (app.readOnly) return;
			const key = keys[button.dataset.modifier!];
			if (key === undefined) return;
			const on = !app.modifiers.has(key);
			if (on) app.modifiers.add(key); else app.modifiers.delete(key);
			app.send(cmd.key(key, on));
			app.surface.dispatchEvent(new CustomEvent('voxl-modifier-change', { detail: { key, on } }));
			paint();
		});
	}
	app.surface.addEventListener('voxl-modifiers-reset', clear);
	window.addEventListener('blur', release);
	document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
	paint();
}
