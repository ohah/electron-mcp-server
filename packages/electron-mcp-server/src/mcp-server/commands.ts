/**
 * send_command_to_electron: get_title, get_url, get_body_text, eval.
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
