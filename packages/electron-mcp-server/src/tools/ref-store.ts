/**
 * 통합 Ref 관리자 — agent-browser 스타일 compact ref 시스템.
 * 네임스페이스별 ref 생성: e1(element), p1(process), ch1(ipc channel) 등.
 * 매 snapshot/조회마다 해당 네임스페이스를 초기화하고 새로 생성.
 */

export interface ElementRef {
  backendNodeId: number;
  role: string;
  name: string;
  nth?: number;
}

export interface ProcessRef {
  type: string;
  targetId: string;
  pid?: number;
  webSocketDebuggerUrl?: string;
}

export interface IpcChannelRef {
  eventId: number;
  channel: string;
  direction?: 'in' | 'invoke';
}

type RefData = ElementRef | ProcessRef | IpcChannelRef;

interface RefNamespace<T extends RefData> {
  prefix: string;
  counter: number;
  refs: Map<string, T>;
}

const namespaces = {
  element: { prefix: 'e', counter: 0, refs: new Map() } as RefNamespace<ElementRef>,
  process: { prefix: 'p', counter: 0, refs: new Map() } as RefNamespace<ProcessRef>,
  ipc: { prefix: 'ch', counter: 0, refs: new Map() } as RefNamespace<IpcChannelRef>,
};

function nextRef<T extends RefData>(ns: RefNamespace<T>): string {
  return `${ns.prefix}${++ns.counter}`;
}

function resetNamespace<T extends RefData>(ns: RefNamespace<T>): void {
  ns.counter = 0;
  ns.refs.clear();
}

// --- Element refs ---

export function resetElementRefs(): void {
  resetNamespace(namespaces.element);
}

export function addElementRef(data: ElementRef): string {
  const ref = nextRef(namespaces.element);
  namespaces.element.refs.set(ref, data);
  return ref;
}

export function getElementRef(ref: string): ElementRef | undefined {
  return namespaces.element.refs.get(ref);
}

export function getAllElementRefs(): Map<string, ElementRef> {
  return namespaces.element.refs;
}

// --- Process refs ---

export function resetProcessRefs(): void {
  resetNamespace(namespaces.process);
}

export function addProcessRef(data: ProcessRef): string {
  const ref = nextRef(namespaces.process);
  namespaces.process.refs.set(ref, data);
  return ref;
}

export function getProcessRef(ref: string): ProcessRef | undefined {
  return namespaces.process.refs.get(ref);
}

// --- IPC refs ---

export function resetIpcRefs(): void {
  resetNamespace(namespaces.ipc);
}

export function addIpcRef(data: IpcChannelRef): string {
  const ref = nextRef(namespaces.ipc);
  namespaces.ipc.refs.set(ref, data);
  return ref;
}

export function getIpcRef(ref: string): IpcChannelRef | undefined {
  return namespaces.ipc.refs.get(ref);
}

// --- Ref parsing ---

/**
 * Parse ref from input: "@e1" → "e1", "ref=e1" → "e1", "e1" → "e1"
 */
export function parseRef(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith('@')) return trimmed.slice(1);
  if (trimmed.startsWith('ref=')) return trimmed.slice(4);
  if (/^(e|p|ch)\d+$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Resolve ref to its data from any namespace.
 */
export function resolveRef(ref: string): { type: 'element' | 'process' | 'ipc'; data: RefData } | null {
  const elementData = namespaces.element.refs.get(ref);
  if (elementData) return { type: 'element', data: elementData };
  const processData = namespaces.process.refs.get(ref);
  if (processData) return { type: 'process', data: processData };
  const ipcData = namespaces.ipc.refs.get(ref);
  if (ipcData) return { type: 'ipc', data: ipcData };
  return null;
}

// --- Formatting helpers ---

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export function formatMicroseconds(us: number): string {
  if (us < 1000) return `${us}µs`;
  if (us < 1000000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1000000).toFixed(2)}s`;
}
