import { describe, test, expect } from 'bun:test';
import {
  CDP_REQUEST_TIMEOUT_MS,
  CDP_NAVIGATION_TIMEOUT_MS,
  WAIT_FOR_POLL_MS,
  PORTS,
  MAX_NAVIGATION_SAVED,
  MAX_IPC_EVENTS_SAVED,
  MAX_MAIN_NETWORK_SAVED,
  EXECUTE_TIMEOUT_MS,
  AUTO_STOP_TRACE_DURATION_MS,
  TRACING_COMPLETE_TIMEOUT_MS,
  RELOAD_WAIT_MS,
} from '../../src/tools/constants';

describe('constants', () => {
  test('timeouts are positive numbers', () => {
    expect(CDP_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(CDP_NAVIGATION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(WAIT_FOR_POLL_MS).toBeGreaterThan(0);
    expect(EXECUTE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(AUTO_STOP_TRACE_DURATION_MS).toBeGreaterThan(0);
    expect(TRACING_COMPLETE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RELOAD_WAIT_MS).toBeGreaterThan(0);
  });

  test('PORTS contains expected debugging ports', () => {
    expect(PORTS).toContain(9222);
    expect(PORTS).toContain(9229);
    expect(PORTS).toContain(9230);
    expect(PORTS.length).toBeGreaterThanOrEqual(4);
  });

  test('storage limits are reasonable', () => {
    expect(MAX_NAVIGATION_SAVED).toBeGreaterThanOrEqual(1);
    expect(MAX_IPC_EVENTS_SAVED).toBeGreaterThanOrEqual(100);
    expect(MAX_MAIN_NETWORK_SAVED).toBeGreaterThanOrEqual(100);
  });
});
