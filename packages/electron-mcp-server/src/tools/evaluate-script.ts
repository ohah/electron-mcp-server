/**
 * MCP tool: evaluate_script
 * 페이지 컨텍스트에서 JavaScript 함수를 인자와 함께 실행하고 결과를 반환.
 * CDP Runtime.evaluate via executeInElectron.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { executeInElectron } from './electron';

const schema = z.object({
  function: z
    .string()
    .describe(
      '페이지에서 실행할 함수(문자열). 예: "function() { return document.title; }" 또는 "() => document.body.innerText"'
    ),
  args: z.array(z.any()).optional().default([]).describe('함수에 넘길 인자 배열'),
});

function buildExpression(fnStr: string, args: unknown[]): string {
  const safeFn = JSON.stringify(fnStr);
  const safeArgs = JSON.stringify(args);
  return `(function(){var __s=${safeFn};var __f=new Function("return ("+__s+")")();return __f.apply(null,${safeArgs});})()`;
}

export function registerEvaluateScript(server: McpServer): void {
  (
    server as {
      registerTool(
        name: string,
        def: { description: string; inputSchema: z.ZodTypeAny },
        handler: (args: unknown) => Promise<unknown>
      ): void;
    }
  ).registerTool(
    'evaluate_script',
    {
      description:
        '페이지 컨텍스트에서 JavaScript 실행. function(문자열)과 args(배열)를 받아 결과를 반환.',
      inputSchema: schema,
    },
    async (args: unknown) => {
      const { function: fnStr, args: fnArgs } = schema.parse(args);
      const expression = buildExpression(fnStr, fnArgs ?? []);
      const text = await executeInElectron(expression);
      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}
