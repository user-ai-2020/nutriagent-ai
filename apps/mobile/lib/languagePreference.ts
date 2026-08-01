import { Alert, DevSettings, I18nManager, Platform } from "react-native";
import i18n from "./i18n";
import { rtlRequired, type ResponseLanguage } from "./rtlRequired";
import * as storage from "./storage";

export type { ResponseLanguage } from "./rtlRequired";

export const PREFERRED_LANGUAGE_STORAGE_KEY = "preferredLanguage";

function normalizePreferredLanguage(value?: string | null): ResponseLanguage | null {
  if (value === "he" || value === "en" || value === "ru") return value;
  return null;
}

export { rtlRequired };

export async function getStoredPreferredLanguage(): Promise<ResponseLanguage | null> {
  const raw = await storage.getItem(PREFERRED_LANGUAGE_STORAGE_KEY);
  return normalizePreferredLanguage(raw);
}

export async function setStoredPreferredLanguage(lang: ResponseLanguage): Promise<void> {
  await storage.setItem(PREFERRED_LANGUAGE_STORAGE_KEY, lang);
}

export function reloadApp(): void {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.reload();
    return;
  }
  DevSettings.reload();
}

/**
 * Apply RTL layout. When userInitiated, show reload notice before forceRTL (RN requires reload).
 * On cold start (userInitiated=false), apply silently and reload once if direction changed.
 */
export async function applyMobileLayoutDirection(
  lang: ResponseLanguage,
  options: { userInitiated?: boolean } = {}
): Promise<void> {
  const wantRtl = rtlRequired(lang);
  I18nManager.allowRTL(true);

  if (I18nManager.isRTL === wantRtl) return;

  const applyAndReload = () => {
    I18nManager.forceRTL(wantRtl);
    reloadApp();
  };

  if (options.userInitiated) {
    await i18n.changeLanguage(lang);
    await new Promise<void>((resolve) => {
      Alert.alert(i18n.t("system.rtlReloadTitle"), i18n.t("system.rtlReloadMessage"), [
        { text: i18n.t("system.rtlReloadContinue"), onPress: () => resolve() },
      ]);
    });
    applyAndReload();
    return;
  }

  applyAndReload();
}

export async function resolveInitialPreferredLanguage(
  profileValue?: string | null
): Promise<ResponseLanguage> {
  const fromProfile = normalizePreferredLanguage(profileValue);
  if (fromProfile) {
    await setStoredPreferredLanguage(fromProfile);
    return fromProfile;
  }
  const stored = await getStoredPreferredLanguage();
  if (stored) return stored;
  return "en";
}
