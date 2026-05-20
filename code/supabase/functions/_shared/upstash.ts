import { Redis } from 'https://esm.sh/@upstash/redis@1.28.4'

export const getRedisClient = () => {
  const url = Deno.env.get('UPSTASH_REDIS_REST_URL');
  const token = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
  
  if (!url || !token) {
    console.warn('Upstash Redis configuration missing in environment variables.');
    return null;
  }

  return new Redis({
    url,
    token,
  });
};
