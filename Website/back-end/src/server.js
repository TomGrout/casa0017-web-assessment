import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import config from './config/env.js';
import { testConnection } from './config/db.js';
import { initializeSocketHandlers } from './sockets/live.js';
import { startPoller } from './jobs/poller.js';

const httpServer = createServer(app);

// TODO: Initialize Socket.io with CORS config

// TODO: Initialize socket handlers

// TODO: Make io available to app

// TODO: Implement graceful shutdown handler

// TODO: Start server function
// - Test database connection
// - Start HTTP server
// - Start background jobs
