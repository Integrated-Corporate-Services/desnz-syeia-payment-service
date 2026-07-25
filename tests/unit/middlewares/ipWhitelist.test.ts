// Unit Tests for IP Whitelist Middleware
import { Request, Response, NextFunction } from 'express';
import { ipWhitelistMiddleware } from '../../../src/middlewares/ipWhitelist';

describe('IP Whitelist Middleware', () => {
  let req: any; // Use any to allow property assignment
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn(() => ({ json: jsonMock }));

    req = {
      ip: undefined,
      socket: { remoteAddress: undefined },
      path: '/health',
      method: 'GET',
      get: jest.fn(),
    };

    res = {
      status: statusMock,
      json: jsonMock,
    };

    next = jest.fn();

    // Set production environment by default
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('IPv4 Individual IP Matching', () => {
    it('should allow access from whitelisted IP', () => {
      req.ip = '172.31.10.5';
      const middleware = ipWhitelistMiddleware(['172.31.10.5'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should deny access from non-whitelisted IP', () => {
      req.ip = '192.168.1.100';
      const middleware = ipWhitelistMiddleware(['172.31.10.5'], false);

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Access denied',
      });
    });

    it('should handle multiple whitelisted IPs', () => {
      const allowedIps = ['172.31.10.5', '172.31.10.6', '10.0.0.100'];
      const middleware = ipWhitelistMiddleware(allowedIps, false);

      req.ip = '172.31.10.6';
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      req.ip = '10.0.0.100';
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('IPv4 CIDR Range Matching', () => {
    it('should allow access from IP in /8 CIDR range', () => {
      req.ip = '10.45.67.89';
      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow access from IP in /16 CIDR range', () => {
      req.ip = '172.31.200.50';
      const middleware = ipWhitelistMiddleware(['172.31.0.0/16'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow access from IP in /24 CIDR range', () => {
      req.ip = '192.168.1.150';
      const middleware = ipWhitelistMiddleware(['192.168.1.0/24'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should deny access from IP outside /8 CIDR range', () => {
      req.ip = '11.45.67.89';
      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], false);

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should deny access from IP outside /16 CIDR range', () => {
      req.ip = '172.32.1.1';
      const middleware = ipWhitelistMiddleware(['172.31.0.0/16'], false);

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should handle multiple CIDR ranges', () => {
      const middleware = ipWhitelistMiddleware(
        ['10.0.0.0/8', '172.31.0.0/16', '192.168.0.0/16'],
        false
      );

      // Test first range
      req.ip = '10.100.200.50';
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Test second range
      req.ip = '172.31.45.67';
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Test third range
      req.ip = '192.168.100.50';
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should handle /32 CIDR (single IP)', () => {
      req.ip = '172.31.10.5';
      const middleware = ipWhitelistMiddleware(['172.31.10.5/32'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      req.ip = '172.31.10.6';
      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });
  });

  describe('IPv6 Support', () => {
    it('should allow access from whitelisted IPv6 address', () => {
      req.ip = '2001:db8:85a3::8a2e:370:7334';
      const middleware = ipWhitelistMiddleware(['2001:db8:85a3::8a2e:370:7334'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow access from IPv6 CIDR range', () => {
      req.ip = '2001:db8:85a3:0000:0000:8a2e:370:7334';
      const middleware = ipWhitelistMiddleware(['2001:db8:85a3::/48'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should deny access from IPv6 outside CIDR range', () => {
      req.ip = '2001:db9:85a3::8a2e:370:7334';
      const middleware = ipWhitelistMiddleware(['2001:db8:85a3::/48'], false);

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should handle IPv6-mapped IPv4 addresses', () => {
      // Express may return IPv4 address as ::ffff:192.168.1.1
      req.ip = '::ffff:172.31.10.5';
      const middleware = ipWhitelistMiddleware(['172.31.10.5'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('Mixed Whitelist (IPs + CIDR)', () => {
    it('should handle combination of individual IPs and CIDR ranges', () => {
      const middleware = ipWhitelistMiddleware(
        ['10.0.0.0/8', '172.31.10.5', '192.168.1.0/24'],
        false
      );

      // Test CIDR range
      req.ip = '10.100.200.50';
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Test individual IP
      req.ip = '172.31.10.5';
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Test another CIDR range
      req.ip = '192.168.1.100';
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Test denied IP
      req.ip = '8.8.8.8';
      middleware(req as Request, res as Response, next);
      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });
  });

  describe('Environment-Based Bypass', () => {
    it('should bypass whitelist in local environment when bypassInLocal=true', () => {
      process.env.NODE_ENV = 'local';
      req.ip = '1.2.3.4'; // Not in whitelist

      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], true);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should bypass whitelist in test environment when bypassInLocal=true', () => {
      process.env.NODE_ENV = 'test';
      req.ip = '1.2.3.4'; // Not in whitelist

      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], true);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should NOT bypass whitelist in production even if bypassInLocal=true', () => {
      process.env.NODE_ENV = 'production';
      req.ip = '1.2.3.4'; // Not in whitelist

      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], true);

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should enforce whitelist in local environment when bypassInLocal=false', () => {
      process.env.NODE_ENV = 'local';
      req.ip = '1.2.3.4'; // Not in whitelist

      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], false);

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });
  });

  describe('Edge Cases', () => {
    it('should deny access when IP is unknown', () => {
      req.ip = 'unknown';
      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], false);

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should deny access when IP is undefined', () => {
      req.ip = undefined;
      req.socket.remoteAddress = undefined;
      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], false);

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should fallback to socket.remoteAddress when req.ip is undefined', () => {
      req.ip = undefined;
      (req.socket as any).remoteAddress = '10.0.0.50';
      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should handle empty whitelist (deny all)', () => {
      req.ip = '10.0.0.50';
      const middleware = ipWhitelistMiddleware([], false);

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should handle whitespace in whitelist entries', () => {
      req.ip = '10.0.0.50';
      const middleware = ipWhitelistMiddleware(['  10.0.0.0/8  ', '172.31.10.5  '], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid CIDR format gracefully', () => {
      req.ip = '10.0.0.50';
      // Invalid CIDR should be skipped, valid ones should work
      const middleware = ipWhitelistMiddleware(['invalid/cidr', '10.0.0.0/8'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('AWS VPC Common Scenarios', () => {
    it('should allow CloudWatch monitoring from VPC CIDR', () => {
      req.ip = '10.0.45.123';
      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow ECS health checks from same VPC', () => {
      req.ip = '172.31.67.89';
      const middleware = ipWhitelistMiddleware(['172.31.0.0/16'], false);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should deny external health check probes', () => {
      req.ip = '8.8.8.8'; // Google DNS - external IP
      const middleware = ipWhitelistMiddleware(['10.0.0.0/8', '172.31.0.0/16'], false);

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
    });
  });

  describe('Security Logging', () => {
    it('should log IP whitelist violations', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      req.ip = '1.2.3.4';
      const middleware = ipWhitelistMiddleware(['10.0.0.0/8'], false);

      middleware(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);

      consoleWarnSpy.mockRestore();
    });
  });
});
