/// <reference types="vite/client" />

interface ElectronAPI {
  platform: string;
  versions: NodeJS.ProcessVersions;
  registerDemoIpcHandlers: () => Promise<string>;
  invokeTestIpc: (payload?: unknown) => Promise<{ ok: boolean; args: unknown[] }>;
  sendTestIpcOn: (payload?: unknown) => void;
  mainFetchHttpbin: () => Promise<{ status?: number }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
