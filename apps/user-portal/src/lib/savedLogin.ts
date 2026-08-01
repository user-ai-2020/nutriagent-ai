const EMAIL_KEY = "nutriagent_saved_email";
const PASSWORD_KEY = "nutriagent_saved_password";
const REMEMBER_KEY = "nutriagent_remember_login";

export function loadSavedLogin(): { email: string; password: string; remember: boolean } {
  if (typeof window === "undefined") return { email: "", password: "", remember: false };
  const remember = localStorage.getItem(REMEMBER_KEY) === "1";
  if (!remember) return { email: "", password: "", remember: false };
  return {
    email: localStorage.getItem(EMAIL_KEY) ?? "",
    password: localStorage.getItem(PASSWORD_KEY) ?? "",
    remember: true,
  };
}

export function persistSavedLogin(email: string, password: string, remember: boolean) {
  if (typeof window === "undefined") return;
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, "1");
    localStorage.setItem(EMAIL_KEY, email);
    localStorage.setItem(PASSWORD_KEY, password);
  } else {
    localStorage.removeItem(REMEMBER_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(PASSWORD_KEY);
  }
}
