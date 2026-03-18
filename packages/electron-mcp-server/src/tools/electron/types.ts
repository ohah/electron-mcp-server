/**
 * Electron/CDP 공통 타입 정의.
 */

export interface ElectronAppInfo {
  port: number;
  targets: Array<{
    id: string;
    title: string;
    url: string;
    type: string;
    description?: string;
    webSocketDebuggerUrl?: string;
  }>;
}

export interface WindowInfo {
  id: string;
  title: string;
  url: string;
  type: string;
  description: string;
  webSocketDebuggerUrl: string;
}

export interface ElectronWindowResult {
  platform: string;
  devToolsPort?: number;
  windows: WindowInfo[];
  totalTargets: number;
  electronTargets: number;
  message: string;
  automationReady: boolean;
}

/** 앱 한 개 분량 구조(두 군데 연결 시 apps 배열에 사용). */
export interface ElectronAppStructureItem {
  port: number;
  main: WindowInfo | null;
  renderers: WindowInfo[];
  message: string;
}

/** 메인(1) + 렌더러(여러) 구조와 각각에서 가능한 작업. MCP 클라이언트 사전 인지·동시 감시용. */
export interface ElectronProcessStructure {
  platform: string;
  port: number;
  /** 메인 프로세스(노드) 타깃 1개. Node 컨텍스트, DOM 없음. */
  main: WindowInfo | null;
  /** 렌더러 프로세스(페이지) 타깃. DOM, 스크린샷, 클릭 등. */
  renderers: WindowInfo[];
  /** 어디서 무엇이 가능한지 요약. */
  capabilities: {
    main: string[];
    renderers: string[];
  };
  message: string;
  automationReady: boolean;
  /** 스캔된 모든 앱(포트별). 두 군데(9229, 9230) 연결 시 여기서 확인. select_port로 작업할 앱 선택. */
  apps?: ElectronAppStructureItem[];
}

export interface DevToolsTarget {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type: string;
}
