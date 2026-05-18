import { getConsumer } from './kafka';
import { redis } from './redis';

export interface NotificationPayload {
  notificationId: string;
  tenantId: string;
  type: 'email' | 'page' | 'sms';
  recipient: string;
  subject?: string;
  body: string;
  timestamp: string;
}

const IDEMPOTENCY_EXPIRY_SECONDS = 3 * 24 * 60 * 60; // 3 days

const processNotification = async (payload: NotificationPayload) => {
  console.log(`[Tenant: ${payload.tenantId}] Sending ${payload.type} to ${payload.recipient}...`);
  // Simulate actual sending (e.g., via SendGrid, Twilio, etc.)
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log(`Successfully sent ${payload.type} to ${payload.recipient} (NotificationID: ${payload.notificationId})`);
};

export const startNotificationConsumer = async (topics: string[]) => {
  const consumer = getConsumer('notification-engine-group');

  await consumer.connect();
  console.log(`Connected to Kafka, subscribing to topics: ${topics.join(', ')}`);

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;

      let payload: NotificationPayload;
      try {
        payload = JSON.parse(message.value.toString());
      } catch (err) {
        console.error('Failed to parse message value', err);
        return; // drop invalid messages
      }

      const { notificationId, tenantId, type } = payload;
      if (!notificationId || !tenantId) {
        console.warn('Message missing required fields (notificationId, tenantId). Dropping.', payload);
        return;
      }

      const redisKey = `processed_notification:${notificationId}`;

      // SETNX: Set if Not Exists. Returns 1 if set (new message), 0 if already exists (duplicate)
      const isNewMessage = await redis.setnx(redisKey, "processing");

      if (isNewMessage === 1) {
        // We successfully acquired the lock for this NotificationID
        // Set expiry for 3 days as per retention policy requirements
        await redis.expire(redisKey, IDEMPOTENCY_EXPIRY_SECONDS);

        try {
          await processNotification(payload);
          // Mark as successfully completed
          await redis.set(redisKey, "completed", "EX", IDEMPOTENCY_EXPIRY_SECONDS);
        } catch (error) {
          console.error(`Failed to process notification ${notificationId}. Removing lock so it can be retried.`);
          // If processing fails, delete the key so it can be retried 
          await redis.del(redisKey);
          throw error; // This causes Kafka to retry the message and retain it
        }
      } else {
        const status = await redis.get(redisKey);
        console.log(`Skipping duplicate message ${notificationId} (Status: ${status})`);
      }
    },
  });

  return consumer;
};
