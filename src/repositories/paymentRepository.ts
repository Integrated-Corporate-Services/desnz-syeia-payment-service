// Payment Repository
// Data access layer for payment operations

export {}; // Make this a module

const db = require('../database/db');
const getLogger = require('../utils/loggerHelper');
const logger = getLogger(module);

interface Payment {
  id: number;
  application_id: string;
  payment_id: string;
  amount: number;
  status: string;
  finished: boolean;
  [key: string]: any;
}

/**
 * Find payment by GOV.UK Pay payment_id
 */
async function findByPaymentId(paymentId: string): Promise<Payment | null> {
  try {
    const query = `
      SELECT 
        id,
        application_id,
        payment_id,
        amount,
        description,
        reference,
        kind,
        status,
        finished,
        provider,
        return_url,
        next_url,
        created_at,
        user_id
      FROM payment 
      WHERE payment_id = $1
    `;
    
    const result = await db.query(query, [paymentId]);
    
    if (result.rows.length === 0) {
      logger.warn('[PaymentRepository] No payment found', { paymentId });
      return null;
    }
    
    logger.info('[PaymentRepository] Payment found', { 
      paymentId,
      applicationId: result.rows[0].application_id,
      currentStatus: result.rows[0].status
    });
    
    return result.rows[0];
  } catch (error: any) {
    logger.error('[PaymentRepository] Error finding payment', {
      error: error.message,
      paymentId,
    });
    throw error;
  }
}

/**
 * Update payment status and finished flag
 */
async function markOutcome(localId: number, outcome: { status: string; finished: boolean }): Promise<void> {
  try {
    const query = `
      UPDATE payment 
      SET status = $1, finished = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [outcome.status, outcome.finished, localId]);
    
    if (result.rows.length === 0) {
      logger.error('[PaymentRepository] Payment not found for update', { localId });
      throw new Error(`Payment not found with id: ${localId}`);
    }
    
    logger.info('[PaymentRepository] Payment status updated', {
      localId,
      status: outcome.status,
      finished: outcome.finished,
      paymentId: result.rows[0].payment_id
    });
  } catch (error: any) {
    logger.error('[PaymentRepository] Error updating payment outcome', {
      error: error.message,
      localId,
      outcome,
    });
    throw error;
  }
}

/**
 * Get payment by application ID
 */
async function findByApplicationId(applicationId: string): Promise<Payment | null> {
  try {
    const query = `
      SELECT 
        id,
        application_id,
        payment_id,
        amount,
        description,
        reference,
        kind,
        status,
        finished,
        provider,
        return_url,
        next_url,
        created_at,
        user_id
      FROM payment 
      WHERE application_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const result = await db.query(query, [applicationId]);
    
    if (result.rows.length === 0) {
      logger.warn('[PaymentRepository] No payment found for application', { applicationId });
      return null;
    }
    
    logger.info('[PaymentRepository] Payment found by application', { 
      applicationId,
      paymentId: result.rows[0].payment_id,
      status: result.rows[0].status
    });
    
    return result.rows[0];
  } catch (error: any) {
    logger.error('[PaymentRepository] Error finding payment by application', {
      error: error.message,
      applicationId,
    });
    throw error;
  }
}

module.exports = {
  findByPaymentId,
  markOutcome,
  findByApplicationId,
};
