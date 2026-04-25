#!/bin/bash

# LocalStack initialization script
# This runs when LocalStack container starts
# Creates SQS queue fosh    r local testing

echo "🚀 Initializing LocalStack SQS..."

# Wait for LocalStack to be ready
sleep 2

# Create SQS queue for payment webhooks
awslocal sqs create-queue \
  --queue-name payment-webhook-queue \
  --region eu-west-2

echo "✅ SQS queue created: payment-webhook-queue"

# Get queue URL
QUEUE_URL=$(awslocal sqs get-queue-url --queue-name payment-webhook-queue --region eu-west-2 --output text)
echo "📋 Queue URL: $QUEUE_URL"

# Set queue attributes (optional)
awslocal sqs set-queue-attributes \
  --queue-url $QUEUE_URL \
  --attributes VisibilityTimeout=30,MessageRetentionPeriod=345600

echo "✅ LocalStack SQS initialization complete!"
