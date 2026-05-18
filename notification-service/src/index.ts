import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getProducer, disconnectKafka } from './kafka';
import { disconnectRedis } from './redis';
import { startNotificationConsumer, NotificationPayload } from './consumer';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const TENANT_TOPICS = ['notifications.tenantA', 'notifications.tenantB'];

// API endpoint to simulate producing a notification (usually called by another service)
app.post('/api/notifications', async (req, res) => {
  try {
    const { tenantId, type, recipient, subject, body } = req.body;

    if (!tenantId || !type || !recipient || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const producer = await getProducer();
    const notificationId = uuidv4();
    const topic = `notifications.${tenantId}`;

    const payload: NotificationPayload = {
      notificationId,
      tenantId,
      type,
      recipient,
      subject,
      body,
      timestamp: new Date().toISOString()
    };

    // Send the message to Kafka
    await producer.send({
      topic,
      messages: [
        {
          key: notificationId, // Using NotificationID as key ensures messages for the same ID go to the same partition
          value: JSON.stringify(payload)
        }
      ]
    });

    console.log(`Produced message to ${topic}: ${notificationId}`);
    res.status(202).json({ success: true, notificationId, status: 'queued' });

  } catch (error) {
    console.error('Error producing message:', error);
    res.status(500).json({ error: 'Failed to queue notification' });
  }
});

let consumerInstance: any = null;

const startServer = async () => {
  try {
    // Start listening for HTTP requests
    app.listen(PORT, () => {
      console.log(`Notification Engine API running on port ${PORT}`);
    });

    // Start background Kafka consumer
    consumerInstance = await startNotificationConsumer(TENANT_TOPICS);

  } catch (err) {
    console.error('Failed to start Notification Engine:', err);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  if (consumerInstance) {
    await consumerInstance.disconnect();
  }
  await disconnectKafka();
  await disconnectRedis();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
