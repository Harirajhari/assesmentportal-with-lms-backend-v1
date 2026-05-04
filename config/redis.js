const Redis = require('ioredis');
const logger = require('./logger');

let redisClient = null;

const connectRedis = () => {
  redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  redisClient.on('connect', () => logger.info('✅ Redis connected'));
  redisClient.on('error', (err) => logger.error(`❌ Redis error: ${err.message}`));
  redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

  return redisClient;
};

const getRedis = () => {
  if (!redisClient) throw new Error('Redis not initialized. Call connectRedis() first.');
  return redisClient;
};

module.exports = connectRedis;
module.exports.getRedis = getRedis;
