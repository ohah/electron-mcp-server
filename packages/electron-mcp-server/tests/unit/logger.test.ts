import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { createLogger, setLogLevel, getLogLevel } from '../../src/tools/logger';

describe('logger', () => {
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    setLogLevel('debug');
  });

  afterEach(() => {
    errorSpy.mockRestore();
    setLogLevel('info');
  });

  test('createLogger creates named logger', () => {
    const log = createLogger('test-module');
    log.info('hello');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = errorSpy.mock.calls[0][0] as string;
    expect(output).toContain('[test-module]');
    expect(output).toContain('[INFO]');
    expect(output).toContain('hello');
  });

  test('log levels filter correctly', () => {
    setLogLevel('warn');
    const log = createLogger('test');
    log.debug('debug msg');
    log.info('info msg');
    log.warn('warn msg');
    log.error('error msg');
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  test('debug level shows all messages', () => {
    setLogLevel('debug');
    const log = createLogger('test');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(errorSpy).toHaveBeenCalledTimes(4);
  });

  test('error level shows only errors', () => {
    setLogLevel('error');
    const log = createLogger('test');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  test('getLogLevel returns current level', () => {
    setLogLevel('warn');
    expect(getLogLevel()).toBe('warn');
  });

  test('logger formats data as JSON when object', () => {
    const log = createLogger('test');
    log.info('data', { key: 'value' });
    const output = errorSpy.mock.calls[0][0] as string;
    expect(output).toContain('{"key":"value"}');
  });

  test('logger formats data as string when string', () => {
    const log = createLogger('test');
    log.info('msg', 'extra');
    const output = errorSpy.mock.calls[0][0] as string;
    expect(output).toContain('extra');
  });
});
