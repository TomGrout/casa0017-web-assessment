import dotenv from 'dotenv';

dotenv.config();

const REQUIRED_ENV_VARS = ['DB_HOST', 'DB_USER', 'DB_NAME'];

// TODO: Export configuration object with all env vars
const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10
  }
});

export default config;
