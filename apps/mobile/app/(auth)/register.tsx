import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { Button, Field } from "@/components/ui";
import { colors, fonts, radius, serif, shadow, space, textMuted } from "@/theme/tokens";

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setLoading(true);
    setError("");
    try {
      await register(name, email, password);
      router.replace("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.registrationFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Text style={styles.kicker}>{t("common.appNameFull")}</Text>
        <Text style={serif(26, { lineHeight: 30 })}>{t("auth.createAccount")}</Text>
        <Text style={styles.subtitle}>{t("auth.registerSubtitle")}</Text>

        <Field label={t("common.fullName")} placeholder="Alex Cohen" value={name} onChangeText={setName} />
        <Field
          label={t("common.email")}
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Field
          label={t("common.password")}
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          title={loading ? t("auth.creatingAccount") : t("auth.createAccount")}
          onPress={handleRegister}
          loading={loading}
          style={{ marginTop: space[2] }}
        />

        <Text style={styles.footer}>
          {t("auth.alreadyRegistered")}{" "}
          <Link href="/(auth)/login" style={styles.link}>
            {t("auth.signIn")}
          </Link>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: space[5] },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], ...shadow.md },
  kicker: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.accent700,
    marginBottom: 4,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: textMuted[60], marginTop: 6, marginBottom: space[5] },
  error: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.accent2700,
    backgroundColor: colors.accent2100,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: space[2],
  },
  footer: { fontFamily: fonts.body, fontSize: 12.5, color: textMuted[60], textAlign: "center", marginTop: space[4] },
  link: { color: colors.accent700 },
});
