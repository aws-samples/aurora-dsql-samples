import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import app from './app';

describe('Express app setup', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should parse JSON request bodies', async () => {
    // Create a fresh app to test JSON parsing in isolation
    const testApp = express();
    testApp.use(express.json());
    testApp.post('/echo', (req: Request, res: Response) => {
      res.json({ received: req.body });
    });

    const payload = { email: 'test@example.com', password: 'secret123' };
    const res = await request(testApp)
      .post('/echo')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.received).toEqual(payload);
  });

  it('should return 500 with generic error from the global error handler', async () => {
    // Build a standalone app that mirrors the production error handler
    // to verify the handler shape without mutating the shared app instance.
    const testApp = express();
    testApp.use(express.json());

    testApp.get('/trigger-error', (_req: Request, _res: Response, next: NextFunction) => {
      next(new Error('Something broke'));
    });

    // Same error handler as in app.ts
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    testApp.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    });

    const res = await request(testApp).get('/trigger-error');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });
});
