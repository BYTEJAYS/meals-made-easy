import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/meal_kits',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  ownerApiKey: process.env.OWNER_API_KEY || '',
};
