/**
 * Execute JavaScript in a running Electron app via CDP WebSocket.
 */

import WebSocket from 'ws';
import { scanForElectronApps, findMainTarget } from './discovery';

export interface DevToolsTarget {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type: string;
}

export async function findElectronTarget(): Promise<DevToolsTarget> {
  const apps = await scanForElectronApps();
  if (apps.length === 0) {
    throw new Error(
      'No Electron app with remote debugging. Start with: electron . --remote-debugging-port=9222'
    );
  }
  const app = apps[0];
  const main = findMainTarget(app.targets);
  if (!main?.webSocketDebuggerUrl) {
    throw new Error('No suitable CDP target found.');
  }
  return {
    id: main.id,
    title: main.title,
    url: main.url,
    webSocketDebuggerUrl: main.webSocketDebuggerUrl,
    type: main.type,
  };
}

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
        reject(new Error('Command execution timeout (10s)'));
      }, 10000);

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

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  })();
}
