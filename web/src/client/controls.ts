// Group controls by task instead of growing an undifferentiated mobile toolbar.
import type { App } from './app';

export function setupControlTabs(app: App, layout: () => void) {
	const get = (id: string) => document.getElementById(id)!;
	const groups: Record<string, HTMLElement> = {
		mouse: get('controls-mouse'), i3: get('i3-panel'), keys: get('controls-keys'), more: get('controls-more'), sessions: get('controls-sessions'),
	};
	for (const id of ['joystick-panel', 'touch-mode-btn', 'zoom-btn']) groups.mouse.appendChild(get(id));
	for (const id of ['help-btn', 'install-btn', 'mic-btn', 'files-btn', 'fs-btn']) groups.more.appendChild(get(id));
	get('keyboard-slot').appendChild(get('kb-btn'));
	get('i3-btn').hidden = true;
	app.tools.classList.add('controls-ready');
	const collapseButton = get('dock-toggle');
	let collapsed = false;
	try { collapsed = localStorage.getItem('voxl-controls-collapsed') === 'true'; } catch {}
	function updateCollapsed() {
		app.tools.classList.toggle('dock-collapsed', collapsed);
		// SVG avoids platform-dependent glyph baselines and off-center hamburger text.
		const path = collapsed ? 'M4 6h16M4 12h16M4 18h16' : 'm6 9 6 6 6-6';
		collapseButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
		collapseButton.setAttribute('aria-expanded', String(!collapsed));
		collapseButton.setAttribute('aria-label', collapsed ? 'Expand controls' : 'Collapse controls');
		collapseButton.title = collapsed ? 'Expand controls' : 'Collapse controls';
		layout();
	}
	collapseButton.addEventListener('click', () => {
		app.surface.dispatchEvent(new Event('voxl-release-pointer'));
		collapsed = !collapsed;
		try { localStorage.setItem('voxl-controls-collapsed', String(collapsed)); } catch {}
		updateCollapsed();
	});
	updateCollapsed();
	const tabs = [...app.tools.querySelectorAll<HTMLButtonElement>('[data-control-tab]')];
	let selected = app.tools.classList.contains('touch') ? 'mouse' : 'i3';
	function available(name: string) {
		return name !== 'i3' || (!app.readOnly && !app.remoteMac);
	}
	function select(name: string) {
		if (!available(name)) name = 'more';
		if (selected !== name) app.surface.dispatchEvent(new Event('voxl-release-pointer'));
		selected = name;
		for (const [key, panel] of Object.entries(groups)) {
			panel.hidden = key !== name;
			panel.setAttribute('role', 'tabpanel');
			panel.setAttribute('aria-labelledby', `tab-${key}`);
		}
		for (const tab of tabs) {
			const active = tab.dataset.controlTab === name;
			tab.setAttribute('aria-selected', String(active));
			tab.tabIndex = active ? 0 : -1;
			tab.hidden = !available(tab.dataset.controlTab!);
		}
		app.tools.classList.remove('i3-open');
		app.tools.classList.toggle('i3-active', name === 'i3');
		layout();
	}
	for (const tab of tabs) {
		tab.addEventListener('click', () => select(tab.dataset.controlTab!));
		tab.addEventListener('keydown', e => {
			if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
			e.preventDefault(); e.stopPropagation();
			const visible = tabs.filter(t => !t.hidden && getComputedStyle(t).display !== 'none');
			const index = visible.indexOf(tab);
			const next = e.key === 'Home' ? visible[0] : e.key === 'End' ? visible.at(-1)! : visible[(index + (e.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length];
			select(next.dataset.controlTab!); next.focus();
		});
	}
	app.surface.addEventListener('voxl-controls-update', () => select(selected));
	select(selected);
}
