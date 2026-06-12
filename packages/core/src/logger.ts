import pino from 'pino';
import { config } from './config';

const isDevelopment = config.nodeEnv === 'development';

export const logger = pino({
  level: config.logLevel,
  base: {
    env: config.nodeEnv,
    service: config.serviceName,
  },
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Export convenience methods with context support
export const log = {
  info: (obj: Record<string, unknown>, msg?: string) => logger.info(obj, msg),
  error: (obj: Record<string, unknown>, msg?: string) => logger.error(obj, msg),
  warn: (obj: Record<string, unknown>, msg?: string) => logger.warn(obj, msg),
  debug: (obj: Record<string, unknown>, msg?: string) => logger.debug(obj, msg),
  fatal: (obj: Record<string, unknown>, msg?: string) => logger.fatal(obj, msg),
  trace: (obj: Record<string, unknown>, msg?: string) => logger.trace(obj, msg),
  // Contextual child logger — workers call log.child({...}) per event.
  child: (context: Record<string, unknown>) => logger.child(context),
};

// Child logger factory for contextual logging
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
