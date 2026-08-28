const EMAIL_KEY = "nutriagent_saved_email";
/** Legacy key — previous builds stored the password here in cleartext. Only ever
 *  removed now, never written, so existing installs get purged on next load. */
const LEGACY_PASSWORD_KEY = "nutriagent_saved_password";
const REMEMBER_KEY = "nutriagent_remember_login";

/**
 * "Remember me" remembers the email address only.
 *
 * This used to also persist the password in localStorage in cleartext, where any
 * XSS, any browser extension, and anyone with access to the machine could read
 * it — and users reuse passwords, so the blast radius went well beyond this app.
 * The signature keeps `password` so callers are unchanged; it is always "".
 */
export function loadSavedLogin(): { email: string; password: string; remember: boolean } {
  if (typeof window === "undefined") return { email: "", password: "", remember: false };
  // Purge any password written by an older build of this app.
  localStorage.removeItem(LEGACY_PASSWORD_KEY);
  const remember = localStorage.getItem(REMEMBER_KEY) === "1";
  if (!remember) return { email: "", password: "", remember: false };
  return {
    email: localStorage.getItem(EMAIL_KEY) ?? "",
    password: "",
    remember: true,
  };
}

export function persistSavedLogin(email: string, _password: string, remember: boolean) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LEGACY_PASSWORD_KEY);
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, "1");
    localStorage.setItem(EMAIL_KEY, email);
  } else {
    localStorage.removeItem(REMEMBER_KEY);
    localStorage.removeItem(EMAIL_KEY);
  }
}
