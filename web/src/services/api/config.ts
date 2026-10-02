/**
 * 配置相关 API
 */

import { apiClient } from './client';
import type { Config } from '@/types';
import { normalizeConfigResponse } from './transformers';

export const configApi = {
  /**
   * 获取配置（会进行字段规范化）
   */
  async getConfig(): Promise<Config> {
    const raw = await apiClient.get('/config');
    return normalizeConfigResponse(raw);
  },

  /**
   * 请求日志开关
   */
  updateRequestLog: (enabled: boolean) =>
    apiClient.put('/config/observability/logs/request-log', enabled),

  /** 文件日志开关（日志页与路由页 affinity 活动都依赖它）。 */
  updateLoggingToFile: (enabled: boolean) =>
    apiClient.put('/config/observability/logs/logging-to-file', enabled),

  /** 会话亲和（sticky session）开关与子代理继承、绑定 TTL、路由策略。 */
  updateSessionAffinity: (enabled: boolean) =>
    apiClient.put('/config/routing/session-affinity', enabled),

  updateSessionAffinitySubagents: (enabled: boolean) =>
    apiClient.put('/config/routing/session-affinity-subagents', enabled),

  updateSessionAffinityTtl: (ttl: string) =>
    apiClient.put('/config/routing/session-affinity-ttl', ttl),

  updateRoutingStrategy: (strategy: string) =>
    apiClient.put('/config/routing/strategy', strategy),
};
