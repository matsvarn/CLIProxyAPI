/**
 * 隐私显示偏好：邮箱/账号标识默认打码，跨页面共享（额度页、路由页）。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PrivacyState {
  showEmails: boolean;
  toggleShowEmails: () => void;
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      showEmails: false,
      toggleShowEmails: () => set((state) => ({ showEmails: !state.showEmails })),
    }),
    {
      name: 'privacy.showEmails',
    }
  )
);
