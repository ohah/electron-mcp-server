/**
 * 에뮬레이션 (Emulation) — CDP Emulation 도메인 사용.
 * 디바이스 에뮬레이션, 네트워크 스로틀링, 다크/라이트 모드, 지오로케이션, 뷰포트 등.
 * @see https://github.com/ohah/electron-mcp-server/issues/3
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findElectronTarget, withCdpWs, sendCdp } from './electron';
import { createLogger } from './logger';

const logger = createLogger('emulation');

const emulateSchema = z.object({
  colorScheme: z
    .enum(['dark', 'light', 'no-preference'])
    .optional()
    .describe('Emulate prefers-color-scheme: dark, light, or no-preference'),
  cpuThrottling: z
    .number()
    .min(1)
    .optional()
    .describe('CPU throttle rate (e.g. 4 = 4x slowdown). 1 = no throttle.'),
  geolocation: z
    .object({
      latitude: z.number().describe('Latitude'),
      longitude: z.number().describe('Longitude'),
      accuracy: z.number().optional().describe('Accuracy in meters (default 1)'),
    })
    .optional()
    .describe('Override geolocation'),
  networkConditions: z
    .object({
      offline: z.boolean().optional().describe('Simulate offline'),
      latency: z.number().optional().describe('Latency in ms'),
      downloadThroughput: z.number().optional().describe('Download speed (bytes/s). -1 = disable'),
      uploadThroughput: z.number().optional().describe('Upload speed (bytes/s). -1 = disable'),
    })
    .optional()
    .describe('Emulate network conditions (throttle, offline)'),
  userAgent: z.string().optional().describe('Override User-Agent string'),
  viewport: z
    .object({
      width: z.number().describe('Viewport width'),
      height: z.number().describe('Viewport height'),
      deviceScaleFactor: z.number().optional().describe('Device scale factor (default 1)'),
      mobile: z.boolean().optional().describe('Mobile emulation'),
    })
    .optional()
    .describe('Override viewport size and device metrics'),
  timezoneId: z.string().optional().describe('Timezone ID (e.g. "Asia/Seoul", "America/New_York")'),
  locale: z.string().optional().describe('Locale override (e.g. "ko-KR", "en-US")'),
  disabledImageTypes: z
    .array(z.enum(['avif', 'jxl', 'webp']))
    .optional()
    .describe('Disable specific image types'),
});

const resizePageSchema = z.object({
  width: z.number().describe('New width in pixels'),
  height: z.number().describe('New height in pixels'),
  deviceScaleFactor: z.number().optional().describe('Device scale factor (default 1)'),
  mobile: z.boolean().optional().describe('Mobile emulation'),
});

export function registerEmulationTools(server: McpServer): void {
  const s = server as {
    registerTool(
      name: string,
      def: { description: string; inputSchema: z.ZodTypeAny },
      handler: (args: unknown) => Promise<unknown>
    ): void;
  };

  s.registerTool(
    'emulate',
    {
      description:
        'Emulate device conditions: dark/light mode, CPU throttle, geolocation, network conditions, User-Agent, viewport, timezone, locale. Multiple options can be set at once.',
      inputSchema: emulateSchema,
    },
    async (args: unknown) => {
      const params = emulateSchema.parse(args ?? {});
      const hasAnyOption =
        params.colorScheme != null ||
        params.cpuThrottling != null ||
        params.geolocation != null ||
        params.networkConditions != null ||
        params.userAgent != null ||
        params.viewport != null ||
        params.timezoneId != null ||
        params.locale != null ||
        (params.disabledImageTypes != null && params.disabledImageTypes.length > 0);

      if (!hasAnyOption) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No emulation options specified. Provide at least one option (colorScheme, cpuThrottling, geolocation, networkConditions, userAgent, viewport, timezoneId, locale).',
            },
          ],
        };
      }

      const target = await findElectronTarget();
      const applied: string[] = [];

      await withCdpWs(target, async (ws) => {
        // Color scheme (dark/light mode)
        if (params.colorScheme) {
          await sendCdp(ws, 'Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-color-scheme', value: params.colorScheme }],
          });
          applied.push(`colorScheme: ${params.colorScheme}`);
        }

        // CPU throttling
        if (params.cpuThrottling != null) {
          await sendCdp(ws, 'Emulation.setCPUThrottlingRate', {
            rate: params.cpuThrottling,
          });
          applied.push(`cpuThrottling: ${params.cpuThrottling}x`);
        }

        // Geolocation
        if (params.geolocation) {
          await sendCdp(ws, 'Emulation.setGeolocationOverride', {
            latitude: params.geolocation.latitude,
            longitude: params.geolocation.longitude,
            accuracy: params.geolocation.accuracy ?? 1,
          });
          applied.push(
            `geolocation: ${params.geolocation.latitude}, ${params.geolocation.longitude}`
          );
        }

        // Network conditions
        if (params.networkConditions) {
          const nc = params.networkConditions;
          await sendCdp(ws, 'Network.enable');
          await sendCdp(ws, 'Network.emulateNetworkConditions', {
            offline: nc.offline ?? false,
            latency: nc.latency ?? 0,
            downloadThroughput: nc.downloadThroughput ?? -1,
            uploadThroughput: nc.uploadThroughput ?? -1,
          });
          if (nc.offline) {
            applied.push('network: offline');
          } else {
            const parts = [];
            if (nc.latency) parts.push(`latency=${nc.latency}ms`);
            if (nc.downloadThroughput && nc.downloadThroughput > 0)
              parts.push(`download=${nc.downloadThroughput}B/s`);
            if (nc.uploadThroughput && nc.uploadThroughput > 0)
              parts.push(`upload=${nc.uploadThroughput}B/s`);
            applied.push(`network: ${parts.length > 0 ? parts.join(', ') : 'custom'}`);
          }
        }

        // User-Agent
        if (params.userAgent) {
          await sendCdp(ws, 'Emulation.setUserAgentOverride', {
            userAgent: params.userAgent,
          });
          applied.push(`userAgent: ${params.userAgent.slice(0, 50)}...`);
        }

        // Viewport
        if (params.viewport) {
          const vp = params.viewport;
          await sendCdp(ws, 'Emulation.setDeviceMetricsOverride', {
            width: vp.width,
            height: vp.height,
            deviceScaleFactor: vp.deviceScaleFactor ?? 1,
            mobile: vp.mobile ?? false,
          });
          applied.push(`viewport: ${vp.width}x${vp.height}`);
        }

        // Timezone
        if (params.timezoneId) {
          await sendCdp(ws, 'Emulation.setTimezoneOverride', {
            timezoneId: params.timezoneId,
          });
          applied.push(`timezone: ${params.timezoneId}`);
        }

        // Locale
        if (params.locale) {
          await sendCdp(ws, 'Emulation.setLocaleOverride', {
            locale: params.locale,
          });
          applied.push(`locale: ${params.locale}`);
        }

        // Disabled image types
        if (params.disabledImageTypes && params.disabledImageTypes.length > 0) {
          await sendCdp(ws, 'Emulation.setDisabledImageTypes', {
            imageTypes: params.disabledImageTypes,
          });
          applied.push(`disabledImages: ${params.disabledImageTypes.join(', ')}`);
        }
      });

      logger.info('Emulation applied', applied);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Emulation applied:\n${applied.map((a) => `  - ${a}`).join('\n')}`,
          },
        ],
      };
    }
  );

  s.registerTool(
    'resize_page',
    {
      description: 'Resize the page viewport to the specified dimensions.',
      inputSchema: resizePageSchema,
    },
    async (args: unknown) => {
      const { width, height, deviceScaleFactor, mobile } = resizePageSchema.parse(args);
      const target = await findElectronTarget();

      await withCdpWs(target, async (ws) => {
        await sendCdp(ws, 'Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: deviceScaleFactor ?? 1,
          mobile: mobile ?? false,
        });
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Page resized to ${width}x${height}`,
          },
        ],
      };
    }
  );
}
