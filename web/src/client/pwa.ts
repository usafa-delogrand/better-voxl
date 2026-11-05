// Install affordance for Chromium and Add-to-Home-Screen guidance for iOS.
interface InstallEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: string }>;
}
export function setupPwa() {
	const button = document.getElementById('install-btn')!;
	let pending: InstallEvent | null = null;
	const standalone = () => matchMedia('(display-mode: standalone)').matches ||
		!!(navigator as Navigator & { standalone?: boolean }).standalone;
	button.hidden = standalone();
	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		pending = event as InstallEvent;
		button.hidden = false;
	});
	window.addEventListener('appinstalled', () => { button.hidden = true; pending = null; });
	button.addEventListener('click', async () => {
		if (pending) {
			await pending.prompt();
			await pending.userChoice;
			pending = null;
		} else {
			alert('Install Voxl: on iPhone/iPad, open this stream directly in Safari, tap Share, then Add to Home Screen. On desktop/Android use your browser’s Install app menu. If Voxl is embedded, open the stream itself in a new tab first. HTTPS is required. The installed app may ask you to sign in again.');
		}
	});
	if ('serviceWorker' in navigator && window.isSecureContext) {
		navigator.serviceWorker.register('sw.js', { scope: './' })
			.catch(error => console.warn('[voxl] service worker registration', error));
	}
}
