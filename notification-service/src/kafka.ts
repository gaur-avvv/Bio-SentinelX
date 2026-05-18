import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';

// Initialize Kafka client
export const kafka = new Kafka({
  clientId: 'bio-sentinelx-notification-service',
  brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
  logLevel: logLevel.INFO,
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

let producer: Producer | null = null;

export const getProducer = async (): Promise<Producer> => {
  if (!producer) {
    producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000
    });
    await producer.connect();
  }
  return producer;
};

export const getConsumer = (groupId: string): Consumer => {
  return kafka.consumer({ groupId });
};

// Export to cleanly shutdown
export const disconnectKafka = async () => {
  if (producer) {
    await producer.disconnect();
  }
};
