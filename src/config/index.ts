import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '6002', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/oms',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:6000',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'your-access-secret-key',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  bcrypt: {
    saltRounds: 10,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
};

export default config;
