import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import config from './config/env.js';
import requestLogger from './middleware/requestLogger.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';

// TODO: Import routes

const app = express();

// TODO: Add helmet security middleware
// TODO: Configure CORS
// TODO: Add request logging
// TODO: Add body parsing middleware
// TODO: Add compression middleware
// TODO: Add rate limiting to /api routes

// TODO: Add health check endpoint

// TODO: Mount API routes
// TODO: Add 404 handler
// TODO: Add global error handler

export default app;
