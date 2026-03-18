/**
 * Electron/CDP 공통: 앱 발견, 타겟 조회, JS 실행, CDP 명령.
 * 기존 단일 파일(567줄)을 types, cdp, discovery, execute로 분리.
 * 이 파일은 하위 호환성을 위한 re-export.
 */

export type {
  ElectronAppInfo,
  WindowInfo,
  ElectronWindowResult,
  ElectronAppStructureItem,
  ElectronProcessStructure,
  DevToolsTarget,
} from './types';

export { withCdpWs, sendCdp } from './cdp';

export {
  scanForElectronApps,
  getLastScanError,
  getSelectedPort,
  setSelectedPort,
  getCurrentApp,
  findMainTarget,
  getSelectedPageId,
  setSelectedPageId,
  findRendererTarget,
  getMainProcessTarget,
  getTargetByPageId,
  findElectronTarget,
  getElectronWindowInfo,
  getElectronProcessStructure,
} from './discovery';

export { executeInElectron } from './execute';

export { acquire as acquireConnection, getPoolStats, clearPool } from './connection-pool';
