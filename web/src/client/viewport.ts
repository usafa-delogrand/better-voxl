// iOS can resize/pan the visual viewport while leaving the layout viewport intact.
type VisibleViewport = Pick<VisualViewport, 'width' | 'height' | 'offsetLeft' | 'offsetTop' | 'scale'>;
export function viewportBounds(viewport: VisibleViewport | null, layoutWidth: number, layoutHeight: number) {
	const width = Math.max(1, viewport?.width || layoutWidth);
	const height = Math.max(1, viewport?.height || layoutHeight);
	const left = Math.max(0, viewport?.offsetLeft || 0);
	const top = Math.max(0, viewport?.offsetTop || 0);
	return {
		width, height, left, top,
		bottom: Math.max(0, layoutHeight - height - top),
		// Ignore pinch zoom and browser-chrome-sized changes.
		keyboardOpen: (viewport?.scale || 1) < 1.1 && layoutHeight - height > 120,
	};
}
