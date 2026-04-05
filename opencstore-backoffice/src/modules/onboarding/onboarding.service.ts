/**
 * src/modules/onboarding/onboarding.service.ts
 *
 * Renderer-side facade for first-run and store-setup operations.
 */

export interface StoreSetup {
  name:          string;
  address?:      string;
  city?:         string;
  state?:        string;
  zip?:          string;
  phone?:        string;
  timezone:      string;
  tax_rate:      number;
  fuel_tax_rate: number;
  pos_type:      string;
}

export interface AdminSetup {
  username:     string;
  password:     string;
  display_name: string;
}

export interface OnboardingPayload {
  store: StoreSetup;
  admin: AdminSetup;
}

export const OnboardingService = {
  async complete(payload: OnboardingPayload): Promise<{ success: boolean; storeId: string; userId: string }> {
    return window.electronAPI.completeOnboarding(payload) as Promise<{ success: boolean; storeId: string; userId: string }>;
  },

  async getState(): Promise<{ onboardingComplete: boolean; activeUserId: string | null; version: string }> {
    return window.electronAPI.getState();
  },
};
