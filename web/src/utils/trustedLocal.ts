import { normalizeApiBase } from './connection';

/**
 * 本地受信任面板探测：仅当页面由后端自身托管（apiBase 与页面同源且路径为
 * /management.html，而非 Vite dev server）时，才尝试无密钥登录。
 */

export interface TrustedLocalLocation {
  origin: string;
  pathname: string;
}

export const shouldProbeTrustedLocal = (
  apiBase: string,
  locationLike: TrustedLocalLocation
): boolean => {
  if (!apiBase || apiBase !== normalizeApiBase(locationLike.origin)) return false;
  return locationLike.pathname.endsWith('/management.html');
};

export const shouldProbeTrustedLocalHere = (apiBase: string): boolean => {
  try {
    return shouldProbeTrustedLocal(apiBase, window.location);
  } catch {
    return false;
  }
};
