// Test SQS Connection to LocalStack
// Run with: node test-sqs-direct.mjs

import { SQSClient, SendMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';

const client = new SQSClient({
  region: 'eu-west-2',
  endpoint: 'http://localhost:4566',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

const queueUrl = 'http://localhost:4566/000000000000/payment-webhook-queue';

async function testSQS() {
  try {
    console.log('🔄 Testing SQS connection to LocalStack...\n');

    // Send a test message
    console.log('📤 Sending test message...');
    const sendCommand = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        test: true,
        timestamp: new Date().toISOString(),
        message: 'Test message from Node.js',
      }),
    });

    const sendResult = await client.send(sendCommand);
    console.log('✅ Message sent successfully!');
    console.log('   Message ID:', sendResult.MessageId);

    // Wait a moment
    console.log('\n⏳ Waiting 2 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Receive messages
    console.log('📥 Receiving messages...');
    const receiveCommand = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 2,
    });

    const receiveResult = await client.send(receiveCommand);

    if (receiveResult.Messages && receiveResult.Messages.length > 0) {
      console.log(`✅ Received ${receiveResult.Messages.length} message(s):`);
      receiveResult.Messages.forEach((msg, index) => {
        console.log(`\n   Message ${index + 1}:`);
        console.log('   ', msg.Body);
      });
    } else {
      console.log('❌ No messages received');
    }

    console.log('\n✅ Test complete!');
  } catch (error) {
    console.error('❌ Error testing SQS:', error.message);
    console.error('   Full error:', error);
  }
}

testSQS();
