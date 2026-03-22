/** ブラウザ用 WebSocket URL（クエリに JWT を付与） */
export function buildWebSocketUrlWithToken(token: string): string {
	const base = import.meta.env.PUBLIC_WS_URL || 'ws://localhost:3001/ws';
	const sep = base.includes('?') ? '&' : '?';
	return `${base}${sep}token=${encodeURIComponent(token)}`;
}
