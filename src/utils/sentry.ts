import * as Sentry from '@sentry/nextjs';

/**
 * Sentry utility functions for error tracking and context.
 *
 * Sentry is initialized globally via instrumentation.ts → sentry.server.config.ts.
 * These helpers provide convenient wrappers for error capture and context setting.
 * All functions are safe no-ops if Sentry is not initialized (no DSN configured).
 */

/**
 * Captures an error in Sentry with additional context
 *
 * @param error - The error to capture
 * @param context - Additional context to attach to the error
 */
export function captureError(
  error: Error | unknown,
  context?: {
    runId?: string;
    configId?: string;
    blueprintKey?: string;
    [key: string]: any;
  }
) {
  try {
    Sentry.captureException(error, {
      contexts: {
        operation: context || {},
      },
      tags: {
        ...(context?.runId && { runId: context.runId }),
        ...(context?.configId && { configId: context.configId }),
      },
    });
  } catch (err) {
    // Silently fail if Sentry is not initialized
  }
}

/**
 * Adds breadcrumb for debugging
 *
 * @param message - Breadcrumb message
 * @param data - Additional data
 * @param level - Severity level
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, any>,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info'
) {
  try {
    Sentry.addBreadcrumb({
      message,
      level,
      data,
      timestamp: Date.now() / 1000,
    });
  } catch (err) {
    // Silently fail if Sentry is not initialized
  }
}

/**
 * Sets user context for the current scope
 */
export function setUserContext(userId: string, additionalData?: Record<string, any>) {
  try {
    Sentry.setUser({
      id: userId,
      ...additionalData,
    });
  } catch (err) {
    // Silently fail if Sentry is not initialized
  }
}

/**
 * Sets custom context for the current scope
 */
export function setContext(name: string, context: Record<string, any>) {
  try {
    Sentry.setContext(name, context);
  } catch (err) {
    // Silently fail if Sentry is not initialized
  }
}

/**
 * Re-export commonly used Sentry utilities
 */
export { Sentry };
