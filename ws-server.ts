import http from 'http';
import url from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { verifyToken } from '@clerk/backend';
import 'dotenv/config';

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });

console.log('CLERK_SECRET_KEY in ws-server:', process.env.CLERK_SECRET_KEY);

server.on('upgrade', async(request, socket, head) => {
    try {
        const { query } = url.parse(request.url ?? '', true);
        const token = typeof query.token === 'string' ? query.token : null;

        // トークンがない場合は401 Unauthorized
        if (!token) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        // トークンを検証
        const claims = await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY!,
        });
        const userId = claims.sub;

        wss.handleUpgrade(request, socket, head, (ws) => {
            (ws as any).userId = userId;
            wss.emit('connection', ws, request);
        });
    } catch (error) {
        console.error('verifyToken error', error);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
    }
});

wss.on('connection', (ws) => {
    const userId = (ws as any).userId;
    console.log('WebSocket connected by user', userId);

    ws.on('message', (data) => {
        console.log('recv from', userId, ':', data.toString());
    });
});

server.listen(3001, () => {
    console.log('WS server listening on 3001');
});