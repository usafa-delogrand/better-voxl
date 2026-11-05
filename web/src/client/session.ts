// A server-issued capability, not the login password. Kept in this page's memory
// (never localStorage or the PWA manifest). It covers workers and embedded Safari
// where the browser may omit Basic credentials or block third-party cookies.
export const pageSession = document.querySelector<HTMLMetaElement>('meta[name="voxl-session"]')?.content || '';
