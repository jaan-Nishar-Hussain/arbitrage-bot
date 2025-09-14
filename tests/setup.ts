// Test setup file
import { jest } from '@jest/globals';

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.RPC_URL = 'http://localhost:8545';
process.env.LOG_LEVEL = 'silent';

// Extend timeout for integration tests
jest.setTimeout(30000);
