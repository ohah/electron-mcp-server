/**
 * MCP 도구 목록 (테스트 사이드바용).
 * 이슈 #3 로드맵 기준: 구현된 도구는 ✓, 미구현은 빈 체크박스.
 */

export interface ToolItem {
  id: string;
  label: string;
}

/** 이슈 #3 기준 구현 완료된 도구 id (사이드바에 ✓ 표시) */
export const IMPLEMENTED_IDS = new Set([
  'input_automation',
  'get_electron_window_info',
  'send_command_to_electron',
  'click',
  'drag',
  'fill',
  'fill_form',
  // 'handle_dialog' — Electron 리모트에서 미지원, 스펙에서 제외
  'hover',
  'press_key',
  'upload_file',
  'evaluate_script',
  'take_snapshot',
  'list_console_messages',
  'get_console_message',
  'list_network_requests',
  'get_network_request',
  'list_electron_main_ipc_events',
  'get_electron_main_ipc_event',
  'list_electron_main_network_requests',
  'get_electron_main_network_request',
  'list_pages',
  'select_page',
  'navigate_page',
  'wait_for',
]);

/** 테스트 도구는 있으나 MCP 지원에서 제외된 항목 (사이드바에 취소선) */
export const DISABLED_IDS = new Set(['handle_dialog']);

export const TOOLS: ToolItem[] = [
  { id: 'input_automation', label: '입력 자동화 (한눈에)' },
  { id: 'get_electron_window_info', label: 'get_electron_window_info' },
  { id: 'send_command_to_electron', label: 'send_command_to_electron' },
  { id: 'click', label: 'click' },
  { id: 'drag', label: 'drag' },
  { id: 'fill', label: 'fill' },
  { id: 'fill_form', label: 'fill_form' },
  { id: 'handle_dialog', label: 'handle_dialog' },
  { id: 'hover', label: 'hover' },
  { id: 'press_key', label: 'press_key' },
  { id: 'upload_file', label: 'upload_file' },
  { id: 'evaluate_script', label: 'evaluate_script' },
  { id: 'take_snapshot', label: 'take_snapshot' },
  { id: 'list_console_messages', label: 'list_console_messages' },
  { id: 'get_console_message', label: 'get_console_message' },
  { id: 'close_page', label: 'close_page' },
  { id: 'list_pages', label: 'list_pages' },
  { id: 'navigate_page', label: 'navigate_page' },
  { id: 'new_page', label: 'new_page' },
  { id: 'select_page', label: 'select_page' },
  { id: 'wait_for', label: 'wait_for' },
  { id: 'emulate', label: 'emulate' },
  { id: 'resize_page', label: 'resize_page' },
  { id: 'performance_analyze_insight', label: 'performance_analyze_insight' },
  { id: 'performance_start_trace', label: 'performance_start_trace' },
  { id: 'performance_stop_trace', label: 'performance_stop_trace' },
  { id: 'list_network_requests', label: 'list_network_requests' },
  { id: 'get_network_request', label: 'get_network_request' },
  { id: 'list_electron_main_ipc_events', label: 'list_electron_main_ipc_events' },
  { id: 'get_electron_main_ipc_event', label: 'get_electron_main_ipc_event' },
  { id: 'list_electron_main_network_requests', label: 'list_electron_main_network_requests' },
  { id: 'get_electron_main_network_request', label: 'get_electron_main_network_request' },
];
