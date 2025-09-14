import { logger } from "./logger";

export interface RateLimiterOptions {
  maxRequests: number;
  timeWindow: number; // in milliseconds
  minInterval: number; // minimum time between requests in milliseconds
}

export class RateLimiter {
  private requests: number[] = [];
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private processing = false;
  private lastRequestTime = 0;

  constructor(private options: RateLimiterOptions) {}

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Check if we can make a request
      if (!this.canMakeRequest()) {
        const waitTime = this.getWaitTime();
        logger.debug(`Rate limiter: waiting ${waitTime}ms`);
        await this.sleep(waitTime);
        continue;
      }

      const { fn, resolve, reject } = this.queue.shift()!;

      try {
        // Record the request
        this.recordRequest();

        logger.debug(
          `Rate limiter: executing request. Queue length: ${
            this.queue.length
          }, Current requests: ${this.getCurrentRequestCount()}`
        );

        // Execute the function
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // Ensure minimum interval between requests
      if (this.queue.length > 0) {
        await this.sleep(this.options.minInterval);
      }
    }

    this.processing = false;
  }

  private canMakeRequest(): boolean {
    this.cleanOldRequests();
    return this.requests.length < this.options.maxRequests;
  }

  private getWaitTime(): number {
    this.cleanOldRequests();

    if (this.requests.length === 0) {
      return 0;
    }

    // Calculate time until we can make the next request
    const oldestRequest = this.requests[0];
    const timeWindow = this.options.timeWindow;
    const timeSinceOldest = Date.now() - oldestRequest;
    const timeUntilWindowReset = timeWindow - timeSinceOldest;

    // Also consider minimum interval
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const timeUntilMinInterval =
      this.options.minInterval - timeSinceLastRequest;

    return Math.max(timeUntilWindowReset, timeUntilMinInterval, 0);
  }

  private recordRequest(): void {
    const now = Date.now();
    this.requests.push(now);
    this.lastRequestTime = now;
  }

  private cleanOldRequests(): void {
    const now = Date.now();
    const cutoff = now - this.options.timeWindow;
    this.requests = this.requests.filter((time) => time > cutoff);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get current requests count in the time window
   */
  getCurrentRequestCount(): number {
    this.cleanOldRequests();
    return this.requests.length;
  }
}

/**
 * Exponential backoff retry logic
 */
export class RetryHandler {
  /**
   * Retry a function with exponential backoff
   */
  static async withExponentialBackoff<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      baseDelay?: number;
      maxDelay?: number;
      shouldRetry?: (error: any) => boolean;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      shouldRetry = (error) => this.isRetryableError(error),
    } = options;

    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries || !shouldRetry(error)) {
          throw error;
        }

        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        logger.warn(
          `Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${error}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  private static isRetryableError(error: any): boolean {
    if (!error) return false;

    const errorString = error.toString().toLowerCase();
    const errorCode = error.code;

    // Check for rate limiting errors
    if (errorCode === -32005 || errorString.includes("too many requests")) {
      return true;
    }

    // Check for network errors
    if (
      errorString.includes("network") ||
      errorString.includes("timeout") ||
      errorString.includes("connection") ||
      errorCode === "NETWORK_ERROR" ||
      errorCode === "TIMEOUT"
    ) {
      return true;
    }

    // Check for server errors (5xx)
    if (errorCode >= 500 && errorCode < 600) {
      return true;
    }

    return false;
  }
}
