import app from './app.js';
import config from './config/env.js';
import { testConnection } from './db/db.js';
import { initIngestionCron } from './jobs/startIngestion.js';
import http from 'node:http';
import { initSocket } from './sockets/socket.js';

async function startServer() {
  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Database ping failed');
    }
    console.log('Database connection pool established successfully.');

    const httpServer = http.createServer(app);
    initSocket(httpServer);

    initIngestionCron();

    httpServer.listen(config.port, () => {
      console.log('Server and WebSockets listening...')
    })

    app.listen(config.port, () => {
      console.log(`Server listening on port ${config.port} in [${config.nodeEnv}] mode.`);
    });

    
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();