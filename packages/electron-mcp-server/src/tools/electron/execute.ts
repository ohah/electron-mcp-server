/**
 * Electron 앱에서 JavaScript 실행.
 */

import WebSocket from 'ws';
import { EXECUTE_TIMEOUT_MS } from '../constants';
import { createLogger } from '../logger';
import type { DevToolsTarget } from './types';
import { findElectronTarget } from './discovery';

const logger = createLogger('execute');

export function executeInElectron(
  javascriptCode: string,
  target?: DevToolsTarget
): Promise<string> {
  return (async () => {
    const targetInfo = target ?? (await findElectronTarget());
    if (!targetInfo.webSocketDebuggerUrl) {
      throw new Error('No WebSocket debugger URL');
    }
    const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
    const messageId = Math.floor(Math.random() * 1000000);
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Command execution timeout (${EXECUTE_TIMEOUT_MS / 1000}s)`));
      }, EXECUTE_TIMEOUT_MS);

      ws.on('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        ws.send(
          JSON.stringify({
            id: messageId,
            method: 'Runtime.evaluate',
            params: {
              expression: javascriptCode,
              returnByValue: true,
              awaitPromise: true,
              includeCommandLineAPI: true,
            },
          })
        );
      });

      ws.on('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id !== messageId) return;
          clearTimeout(timeout);
          ws.close();
          if (response.error) {
            reject(new Error(response.error.message || JSON.stringify(response.error)));
            return;
          }
          const result = response.result?.result;
          if (!result) {
            resolve('OK');
            return;
          }
          if (result.type === 'string') {
            resolve(String(result.value));
          } else if (result.type === 'number' || result.type === 'boolean') {
            resolve(String(result.value));
          } else if (result.type === 'undefined') {
            resolve('(undefined)');
          } else if (result.type === 'object' && result.value !== undefined) {
            resolve(JSON.stringify(result.value, null, 2));
          } else {
            resolve(result.description || String(result.value));
          }
        } catch {
          // ignore parse errors for other messages
        }
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        logger.error('executeInElectron WebSocket error', String(err));
        reject(err);
      });
    });
  })();
}
