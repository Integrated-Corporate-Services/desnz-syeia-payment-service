/**
 * GOV.UK Notify Callback Service (Integration Service)
 * 
 * Processes callback notifications from Lambda processor about email send status
 * Updates backend records and triggers any necessary follow-up actions
 * 
 * Integration: desnz-syeia-integration-service
 */

const getLogger = require('../utils/loggerHelper');
const logger = getLogger(module);

interface EmailSentCallbackData {
  callbackId: string;
  correlationId: string;
  reference?: string;
  notificationId: string;
  templateId?: string;
  emailAddress?: string;
  status: string;
  sentAt?: string;
  metadata?: any;
}

interface EmailFailedCallbackData {
  callbackId: string;
  correlationId: string;
  reference?: string;
  templateId?: string;
  error: string;
  errorCode?: string;
  failedAt?: string;
  attempts?: number;
  isRetryable?: boolean;
  metadata?: any;
}

/**
 * Process email sent callback from Lambda processor
 * @param {object} data - Callback data
 * @returns {Promise<object>} - Processing result
 */
export async function processEmailSentCallback(data: EmailSentCallbackData): Promise<any> {
  const { callbackId, correlationId, reference, notificationId, status } = data;

  try {
    logger.info('[NotifyCallbackService] Processing email sent callback', {
      callbackId,
      correlationId,
      reference,
      notificationId,
      status,
    });

    // TODO: Implement your business logic here
    // Examples:
    // 1. Update email_notifications table with status and notificationId
    // 2. Update user record with "email sent" timestamp
    // 3. Trigger follow-up actions (e.g., send SMS if email bounces)
    // 4. Record audit log
    // 5. Emit metrics

    // Example: Update database record
    // await updateEmailNotificationStatus({
    //   reference,
    //   notificationId,
    //   status: 'sent',
    //   sentAt: data.sentAt,
    // });

    // Example: Trigger follow-up action
    // if (data.templateId === 'welcome-email') {
    //   await scheduleOnboardingReminder(data.emailAddress);
    // }

    logger.info('[NotifyCallbackService] Email sent callback processed successfully', {
      callbackId,
      correlationId,
      notificationId,
    });

    return {
      success: true,
      callbackId,
      correlationId,
    };

  } catch (error: any) {
    logger.error('[NotifyCallbackService] Error processing email sent callback', {
      callbackId,
      correlationId,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
}

/**
 * Process email failed callback from Lambda processor
 * @param {object} data - Failure callback data
 * @returns {Promise<object>} - Processing result
 */
export async function processEmailFailedCallback(data: EmailFailedCallbackData): Promise<any> {
  const { callbackId, correlationId, reference, error, attempts } = data;

  try {
    logger.error('[NotifyCallbackService] Processing email failed callback', {
      callbackId,
      correlationId,
      reference,
      error,
      attempts,
      isRetryable: data.isRetryable,
    });

    // TODO: Implement your business logic here
    // Examples:
    // 1. Update email_notifications table with failure status
    // 2. Create support ticket for permanent failures
    // 3. Alert operations team if error rate is high
    // 4. Fallback to alternative communication method (SMS, postal mail)
    // 5. Update user notification preferences if email invalid

    // Example: Update database record
    // await updateEmailNotificationStatus({
    //   reference,
    //   status: 'failed',
    //   error,
    //   errorCode: data.errorCode,
    //   failedAt: data.failedAt,
    //   attempts,
    // });

    // Example: Fallback to SMS for critical notifications
    // if (data.templateId === 'payment-reminder' && !data.isRetryable) {
    //   await sendSMSFallback(data.metadata?.userId);
    // }

    // Example: Alert operations team for permanent failures
    // if (!data.isRetryable && attempts >= 3) {
    //   await alertOperationsTeam({
    //     type: 'email_permanent_failure',
    //     reference,
    //     error,
    //   });
    // }

    logger.info('[NotifyCallbackService] Email failed callback processed', {
      callbackId,
      correlationId,
      reference,
    });

    return {
      success: true,
      callbackId,
      correlationId,
    };

  } catch (error: any) {
    logger.error('[NotifyCallbackService] Error processing email failed callback', {
      callbackId,
      correlationId,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
}

/**
 * Example: Update email notification status in database
 * Uncomment and implement based on your database schema
 */
/*
async function updateEmailNotificationStatus(data: {
  reference?: string;
  notificationId?: string;
  status: string;
  error?: string;
  errorCode?: string;
  sentAt?: string;
  failedAt?: string;
  attempts?: number;
}): Promise<void> {
  // Example PostgreSQL query
  const query = `
    INSERT INTO email_notifications (
      reference,
      notification_id,
      status,
      error,
      error_code,
      sent_at,
      failed_at,
      attempts,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (reference) DO UPDATE SET
      notification_id = EXCLUDED.notification_id,
      status = EXCLUDED.status,
      error = EXCLUDED.error,
      error_code = EXCLUDED.error_code,
      sent_at = EXCLUDED.sent_at,
      failed_at = EXCLUDED.failed_at,
      attempts = EXCLUDED.attempts,
      updated_at = NOW()
  `;

  await db.query(query, [
    data.reference,
    data.notificationId,
    data.status,
    data.error,
    data.errorCode,
    data.sentAt,
    data.failedAt,
    data.attempts,
  ]);
}
*/
