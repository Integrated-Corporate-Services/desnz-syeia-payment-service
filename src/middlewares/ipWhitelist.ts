// IP Whitelist Middleware for Health Endpoint Protection
import { Request, Response, NextFunction } from 'express';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

interface CIDRRange {
  baseIp: number[];
  prefixLength: number;
  isIPv6: boolean;
}

/**
 * Parse CIDR notation (e.g., "10.0.0.0/8") into structured format
 */
function parseCIDR(cidr: string): CIDRRange | null {
  const parts = cidr.trim().split('/');
  if (parts.length !== 2) {
    logger.error('[IPWhitelist] Invalid CIDR format', { cidr });
    return null;
  }

  const [ipStr, prefixStr] = parts;
  const prefixLength = parseInt(prefixStr, 10);

  // Detect IPv4 vs IPv6
  const isIPv6 = ipStr.includes(':');

  if (isIPv6) {
    // IPv6 parsing
    const ipParts = expandIPv6(ipStr);
    if (!ipParts || prefixLength < 0 || prefixLength > 128) {
      logger.error('[IPWhitelist] Invalid IPv6 CIDR', { cidr });
      return null;
    }
    return { baseIp: ipParts, prefixLength, isIPv6: true };
  } else {
    // IPv4 parsing
    const ipParts = ipStr.split('.').map((part) => parseInt(part, 10));
    if (ipParts.length !== 4 || ipParts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      logger.error('[IPWhitelist] Invalid IPv4 address', { cidr });
      return null;
    }
    if (prefixLength < 0 || prefixLength > 32) {
      logger.error('[IPWhitelist] Invalid IPv4 prefix length', { cidr, prefixLength });
      return null;
    }
    return { baseIp: ipParts, prefixLength, isIPv6: false };
  }
}

/**
 * Expand IPv6 address to full 8-group format
 */
function expandIPv6(ipv6: string): number[] | null {
  try {
    // Handle :: notation
    if (ipv6.includes('::')) {
      const parts = ipv6.split('::');
      if (parts.length > 2) return null;

      const left = parts[0] ? parts[0].split(':') : [];
      const right = parts[1] ? parts[1].split(':') : [];
      const missing = 8 - left.length - right.length;

      const groups = [
        ...left,
        ...Array(missing).fill('0'),
        ...right,
      ];

      const expanded = groups.map((g) => parseInt(g || '0', 16));
      if (expanded.length !== 8 || expanded.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) {
        return null;
      }
      return expanded;
    } else {
      const groups = ipv6.split(':');
      if (groups.length !== 8) return null;
      return groups.map((g) => parseInt(g, 16));
    }
  } catch {
    return null;
  }
}

/**
 * Check if IP address matches CIDR range
 */
function ipMatchesCIDR(ip: string, cidrRange: CIDRRange): boolean {
  const isIPv6 = ip.includes(':');

  if (isIPv6 !== cidrRange.isIPv6) {
    return false; // IPv4 vs IPv6 mismatch
  }

  if (isIPv6) {
    const ipParts = expandIPv6(ip);
    if (!ipParts) return false;

    // Compare IPv6 addresses bit by bit
    const bitsToCompare = cidrRange.prefixLength;
    let bitsCompared = 0;

      bitsCompared += bitsInThisGroup;

    return true;
  } else {
    // IPv4 comparison
    const ipParts = ip.split('.').map((p) => parseInt(p, 10));
    if (ipParts.length !== 4 || ipParts.some((p) => isNaN(p))) {
      return false;
    }

    // Convert to 32-bit integers for comparison
    const ipInt = (((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0);
    const baseInt = (((cidrRange.baseIp[0] << 24) | (cidrRange.baseIp[1] << 16) | (cidrRange.baseIp[2] << 8) | cidrRange.baseIp[3]) >>> 0);

    const mask = cidrRange.prefixLength === 0 ? 0 : (0xffffffff << (32 - cidrRange.prefixLength)) >>> 0;

    return (ipInt & mask) === (baseInt & mask);
  }
}

/**
 * Check if IP is in whitelist (supports individual IPs or CIDR ranges)
 */
function isIpWhitelisted(ip: string, whitelist: string[]): boolean {
  if (!ip || ip === 'unknown') {
    return false;
  }

  // Normalize IP (remove IPv6 wrapper if present)
  const normalizedIp = ip.startsWith('::ffff:') ? ip.substring(7) : ip;

  for (const entry of whitelist) {
    const trimmedEntry = entry.trim();

    if (trimmedEntry.includes('/')) {
      // CIDR range
      const cidrRange = parseCIDR(trimmedEntry);
      if (cidrRange && ipMatchesCIDR(normalizedIp, cidrRange)) {
        return true;
      }
    } else {
      // Individual IP
      if (normalizedIp === trimmedEntry) {
        return true;
      }
    }
  }

  return false;
}

/**
 * IP Whitelist Middleware Factory
 * Restricts access to specified IP addresses or CIDR ranges
 * 
 * @param allowedIps - Array of allowed IP addresses or CIDR ranges (e.g., ['10.0.0.0/8', '172.31.45.67'])
 * @param bypassInLocal - If true, bypass whitelist check in local/test environments (default: true)
 * 
 * @example
 * // Restrict to VPC CIDR range
 * router.get('/health', ipWhitelistMiddleware(['10.0.0.0/8']), healthCheck);
 * 
 * @example
 * // Restrict to specific monitoring server IPs
 * router.get('/health', ipWhitelistMiddleware(['172.31.10.5', '172.31.10.6']), healthCheck);
 */
export function ipWhitelistMiddleware(
  allowedIps: string[],
  bypassInLocal: boolean = true
) {
  // Validate configuration at startup
  if (!Array.isArray(allowedIps) || allowedIps.length === 0) {
    logger.warn('[IPWhitelist] No allowed IPs configured - this endpoint will be blocked for all IPs');
  }

  logger.info('[IPWhitelist] IP whitelist initialized', { 
    allowedIps,
    bypassInLocal,
  });

  return (req: Request, res: Response, next: NextFunction) => {
    // Bypass in local/test environments if configured
    const nodeEnv = (process.env.NODE_ENV || 'local').toLowerCase();
    if (bypassInLocal && (nodeEnv === 'local' || nodeEnv === 'test')) {
      logger.debug('[IPWhitelist] Bypassing whitelist check in local/test environment');
      return next();
    }

    // Extract client IP (respects trust proxy configuration)
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    logger.debug('[IPWhitelist] Checking IP whitelist', {
      clientIp,
      allowedIps,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });

    if (isIpWhitelisted(clientIp, allowedIps)) {
      logger.debug('[IPWhitelist] IP whitelist check passed', { 
        clientIp,
        path: req.path,
      });
      return next();
    }

    // IP not whitelisted - deny access
    logger.warn('[IPWhitelist] IP not in whitelist - access denied', {
      clientIp,
      allowedIps,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      securityEvent: 'IP_WHITELIST_VIOLATION',
    });

    res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied',
    });
    return;
  };
}

/**
 * Get IP whitelist from configuration
 * Helper function to load IP whitelist from environment variables
 */
export function getHealthEndpointWhitelist(): string[] {
  const whitelist = process.env.HEALTH_ENDPOINT_ALLOWED_IPS || '';
  
  if (!whitelist) {
    logger.warn(
      '[IPWhitelist] HEALTH_ENDPOINT_ALLOWED_IPS not configured. ' +
      'Health endpoints will be restricted in production.'
    );
    return [];
  }

  return whitelist
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
}

export default ipWhitelistMiddleware;
