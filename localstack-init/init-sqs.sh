#!/bin/bash
set -e

echo "[init-sqs] Creating SQS resources in MiniStack..."

QUEUE_NAME="payment-webhook-queue"
REGION="${AWS_DEFAULT_REGION:-eu-west-2}"
ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"

aws sqs create-queue \
  --queue-name "${QUEUE_NAME}" \
  --region "${REGION}" \
  --endpoint-url "${ENDPOINT}" \
  --attributes VisibilityTimeout=30,MessageRetentionPeriod=345600

QUEUE_URL=$(aws sqs get-queue-url \
  --queue-name "${QUEUE_NAME}" \
  --region "${REGION}" \
  --endpoint-url "${ENDPOINT}" \
  --output text)

echo "[init-sqs] Queue created: ${QUEUE_URL}"

DLQ_NAME="payment-webhook-queue-dlq"

aws sqs create-queue \
  --queue-name "${DLQ_NAME}" \
  --region "${REGION}" \
  --endpoint-url "${ENDPOINT}" \
  --attributes MessageRetentionPeriod=1209600

DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url "$(aws sqs get-queue-url --queue-name "${DLQ_NAME}" --region "${REGION}" --endpoint-url "${ENDPOINT}" --output text)" \
  --attribute-names QueueArn \
  --region "${REGION}" \
  --endpoint-url "${ENDPOINT}" \
  --query 'Attributes.QueueArn' \
  --output text)

aws sqs set-queue-attributes \
  --queue-url "${QUEUE_URL}" \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" \
  --region "${REGION}" \
  --endpoint-url "${ENDPOINT}"

echo "[init-sqs] DLQ created and attached: ${DLQ_ARN}"
echo "[init-sqs] MiniStack SQS initialisation complete"
