# LocalStack SQS Initialization Script (PowerShell)
# Creates SQS queue for local testing with LocalStack

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "Initializing LocalStack SQS..." -ForegroundColor Cyan

# LocalStack endpoint
$endpoint = "http://localhost:4566"
$region = "eu-west-2"
$queueName = "payment-webhook-queue"

# Wait for LocalStack to be ready
Write-Host "Waiting for LocalStack..." -ForegroundColor Gray
Start-Sleep -Seconds 2

try {
    # Create SQS queue
    Write-Host ""
    Write-Host "Creating SQS queue: $queueName" -ForegroundColor Gray
    
    aws sqs create-queue --queue-name $queueName --region $region --endpoint-url $endpoint 2>&1 | Out-Null

    if ($LASTEXITCODE -eq 0) {
        Write-Host "SQS queue created: $queueName" -ForegroundColor Green
    } else {
        Write-Host "Queue may already exist or LocalStack not ready" -ForegroundColor Yellow
    }

    # Get queue URL
    $queueUrl = aws sqs get-queue-url --queue-name $queueName --region $region --endpoint-url $endpoint --output text 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Queue URL: $queueUrl" -ForegroundColor Cyan
    }

    # Set queue attributes
    Write-Host ""
    Write-Host "Setting queue attributes..." -ForegroundColor Gray
    
    aws sqs set-queue-attributes --queue-url $queueUrl --attributes VisibilityTimeout=30,MessageRetentionPeriod=345600 --endpoint-url $endpoint 2>&1 | Out-Null

    Write-Host "LocalStack SQS initialization complete!" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "Error initializing SQS: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure LocalStack is running and AWS CLI is installed" -ForegroundColor Yellow
    exit 1
}
