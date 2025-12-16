import 'dotenv/config';
import { getWebSocketServer } from './lib/websocket/WebSocketServer';

async function startServer() {
  try {
    console.log('🚀 Starting WebSocket Server...');
    console.log('🔑 JWT_SECRET loaded:', process.env.JWT_SECRET ? 'Yes' : 'No');
    
    const wsServer = getWebSocketServer();
    await wsServer.start();
    
    console.log('✅ WebSocket Server started successfully!');
  } catch (error) {
    console.error('❌ Failed to start WebSocket Server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  const wsServer = getWebSocketServer();
  await wsServer.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  const wsServer = getWebSocketServer();
  await wsServer.stop();
  process.exit(0);
});
