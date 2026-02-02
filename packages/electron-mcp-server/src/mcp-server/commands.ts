/**
 * send_command_to_electron: get_title, get_url, get_body_text, eval.
 *
 * 보안: eval 및 default 케이스는 MCP 클라이언트(호출자)가 신뢰된다는 전제 하에
 * Electron 앱에서 임의 JavaScript 실행을 허용합니다. CDP 자동화 목적이므로
 * 신뢰할 수 없는 MCP 클라이언트에 노출하지 마세요.
 */

import { executeInElectron } from './connection';

export type CommandArgs = {
  code?: string;
  selector?: string;
  text?: string;
  value?: string;
  placeholder?: string;
};

export async function sendCommandToElectron(command: string, args?: CommandArgs): Promise<string> {
  const cmd = (command || '').toLowerCase();
  let code: string;
  switch (cmd) {
    case 'get_title':
      code = 'document.title';
      break;
    case 'get_url':
      code = 'window.location.href';
      break;
    case 'get_body_text':
      code = "document.body?.innerText?.substring(0, 5000) ?? ''";
      break;
    case 'eval':
      code = args?.code ?? '';
      if (!code) throw new Error('eval requires args.code');
      break;
    default:
      code = args?.code ?? command;
  }
  return executeInElectron(code);
}
