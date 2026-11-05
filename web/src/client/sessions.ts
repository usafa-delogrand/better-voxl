// Lists live streaming sockets, not saved login cookies or desktop applications.
import type { App } from './app';
import type { FromWorker, SessionInfo } from '../protocol';

export function setupSessions(app: App) {
	const tab = document.getElementById('tab-sessions')!;
	const list = document.getElementById('session-list')!;
	const notice = document.getElementById('session-notice')!;
	let connected = false;
	let selfId = 0;
	let sessions: SessionInfo[] = [];
	const request = () => { if (connected) app.send('sessions'); };
	const disconnect = (id: number) => {
		app.send(`disconnect,${id}`);
		setTimeout(request, 300);
	};
	function render() {
		list.replaceChildren();
		for (const session of sessions) {
			const row = document.createElement('div');
			row.className = 'session-row';
			const info = document.createElement('div');
			const title = document.createElement('strong');
			title.textContent = `#${session.id}${session.id === selfId ? ' · This session' : ''}`;
			const detail = document.createElement('small');
			const ua = session.agent;
			const device = /iPad|iPhone/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
			const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
			detail.textContent = `${device} / ${browser} · ${Math.floor(session.seconds / 60)}m · ${session.video ? 'Video on' : 'Video paused'}${session.audio ? ' · Audio on' : ''}`;
			detail.title = ua;
			info.append(title, detail);
			const button = document.createElement('button');
			button.type = 'button'; button.className = 'ib text-button';
			button.textContent = 'Disconnect'; button.disabled = app.readOnly || !connected;
			button.addEventListener('click', () => disconnect(session.id));
			row.append(info, button); list.append(row);
		}
		notice.textContent = !connected ? 'Not connected. Reload the page to reconnect.' : app.readOnly ? 'View-only: session disconnection is disabled.' : 'Disconnect stops the viewer immediately and closes its tab when the browser allows it.';
	}
	document.getElementById('sessions-refresh')!.addEventListener('click', request);
	tab.addEventListener('click', request);
	setInterval(() => { if (!document.hidden) request(); }, 5000);
	document.addEventListener('visibilitychange', () => { if (!document.hidden) request(); });
	app.worker.addEventListener('message', (event: MessageEvent<FromWorker>) => {
		const m = event.data;
		if (m.t === 'status') {
			connected = m.s === 'open';
			if (connected) request();
			else { tab.textContent = 'Sessions –'; notice.textContent = 'Not connected'; render(); }
		}
		if (m.t === 'hello') { request(); render(); }
		if (m.t === 'sessions') {
			selfId = m.selfId; sessions = m.sessions;
			tab.textContent = `Sessions (${sessions.length})`;
			render();
		}
	});
}
