import http from 'http';
import url from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { verifyToken } from '@clerk/backend';
import 'dotenv/config';

// 接続中のクライアントを管理
const clients = new Set<WebSocket & { userId?: string }>();

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });

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
        const userId = claims.sub as string | undefined;

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
    const userId = (ws as any).userId as string | undefined;
    console.log('WebSocket connected by user', userId);

    const client = ws as WebSocket & { userId?: string };
    client.userId = userId;
    clients.add(client);

    ws.on('close', () => {
        clients.delete(client);
    });

    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());

            if (msg.type === 'message-created') {
                // 今回は msg.message をそのまま配信
                for (const client of clients) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(msg));
                    }
                }
            }
            // 他の type（typing など）も増やせる
        } catch (ex) {
            console.error('failed to handle ws message', ex);
        }
    });
});

// // DBに保存（非同期保存関数）
// async function saveMessageToDb(msg: {
//     threadId: number;
//     content: string;
//     authorId: string;
// }) {
//     // Clerk の userId から自前の User.id を取得
//     const dbUser = await prismaWs.user.findUnique({
//         where: { clerkId: msg.authorId }
//     });
//     if (!dbUser) {
//         console.warn('no local user found for clerkId', msg.authorId);
//         return;
//     }
//     await prismaWs.message.create({
//         data: {
//             threadId: msg.threadId,
//             authorId: dbUser.id,
//             content: msg.content
//         }
//     });
// }

server.listen(3001, () => {
    console.log('WS server listening on 3001');
});