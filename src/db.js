import mongoose from 'mongoose';
import { createClient } from 'redis';
import { config } from './config.js';

export const redis = createClient({ url: config.redisUrl });
redis.on('error', (error) => console.error('Redis error:', error.message));

export async function connectDatabases() {
  await mongoose.connect(config.mongoUri);
  await redis.connect();
}

export async function closeDatabases() {
  await Promise.allSettled([mongoose.disconnect(), redis.quit()]);
}
