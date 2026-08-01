import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  applyRestrictions,
  DIET_TYPES,
  Profile,
  RESTRICTIONS,
  RestrictionId,
  selectedRestrictions,
} from "@/lib/profile";
import { Button, Field, Pill, Radio, Screen, Tag } from "@/components/ui";
import { colors, fonts, serif, space, textMuted } from "@/theme/tokens";
import type { ResponseLanguage } from "@/lib/languagePreference";

const LANGUAGE_OPTIONS = (t: (key: string) => string): { id: ResponseLanguage; label: string }[] => [
  { id: "he", label: t("common.hebrew") },
  { id: "en", label: t("common.english") },
  { id: "ru", label: t("common.russian") },
];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { token, user, logout, preferredLanguage, setPreferredLanguage } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restrictions, setRestrictions] = useState<RestrictionId[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<Profile>("/api/profile", token)
      .then((p) => {
        setProfile(p);
        setRestrictions(selectedRestrictions(p));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  function toggle(id: RestrictionId) {
    setRestrictions((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function saveProfile() {
    if (!token || !profile) return;
    setSaving(true);
    try {
      await api("/api/profile", token, {
        method: "PUT",
        body: JSON.stringify(applyRestrictions(profile, restrictions)),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleLanguageChange(lang: ResponseLanguage) {
    if (lang === preferredLanguage || languageSaving) return;
    setLanguageSaving(true);
    try {
      await setPreferredLanguage(lang);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Language update failed");
    } finally {
      setLanguageSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/(auth)/login");
  }

  if (loading || !profile) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </Screen>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[serif(22), { marginBottom: space[2] }]}>{t("settings.title")}</Text>
      <Text style={styles.identity}>
        {user?.name} · {user?.email}
      </Text>

      <Text style={styles.section}>{t("common.languageLabel")}</Text>
      <Text style={styles.hint}>{t("settings.languageHint")}</Text>
      <View style={styles.pillRow}>
        {LANGUAGE_OPTIONS(t).map((opt) => (
          <Pill
            key={opt.id}
            label={opt.label}
            active={preferredLanguage === opt.id}
            onPress={() => handleLanguageChange(opt.id)}
          />
        ))}
      </View>
      {languageSaving && (
        <Text style={styles.hint}>Saving…</Text>
      )}

      <Text style={styles.section}>Diet goals</Text>
      <Field
        label="Calorie goal (kcal/day)"
        keyboardType="numeric"
        value={String(profile.dietGoals?.dailyCalories ?? "")}
        onChangeText={(v) =>
          setProfile({ ...profile, dietGoals: { ...profile.dietGoals, dailyCalories: Number(v) || 0 } })
        }
      />
      <Field
        label="Protein goal (g/day)"
        keyboardType="numeric"
        value={String(profile.dietGoals?.proteinGrams ?? "")}
        onChangeText={(v) =>
          setProfile({ ...profile, dietGoals: { ...profile.dietGoals, proteinGrams: Number(v) || 0 } })
        }
      />

      <Text style={styles.section}>Health restrictions &amp; allergies</Text>
      <View style={styles.pillRow}>
        {RESTRICTIONS.map((r) => (
          <Pill key={r.id} label={r.label} active={restrictions.includes(r.id)} onPress={() => toggle(r.id)} />
        ))}
      </View>

      <Text style={styles.section}>Diet type</Text>
      {DIET_TYPES.map((d) => (
        <Radio
          key={d.id}
          label={d.label}
          checked={profile.dietType === d.id}
          onPress={() => setProfile({ ...profile, dietType: d.id })}
        />
      ))}

      <Text style={styles.section}>Activity</Text>
      <View style={{ flexDirection: "row", gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Today's steps"
            keyboardType="numeric"
            value={String(profile.todaySteps ?? 0)}
            onChangeText={(v) => setProfile({ ...profile, todaySteps: Number(v) || 0 })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Steps goal"
            keyboardType="numeric"
            value={String(profile.dailyStepsGoal ?? 8000)}
            onChangeText={(v) => setProfile({ ...profile, dailyStepsGoal: Number(v) || 8000 })}
          />
        </View>
      </View>

      <View style={styles.actions}>
        <Button title="Save changes" onPress={saveProfile} loading={saving} />
        {saved && <Tag variant="accent">Saved</Tag>}
      </View>
      <Button title="Log out" variant="danger" onPress={handleLogout} style={{ marginTop: space[3] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center" },
  content: { padding: space[5], paddingBottom: space[8] },
  identity: { fontFamily: fonts.body, fontSize: 12.5, color: textMuted[55], marginBottom: space[5] },
  hint: { fontFamily: fonts.body, fontSize: 12, color: textMuted[55], marginBottom: space[2], lineHeight: 18 },
  section: { fontFamily: fonts.heading, fontWeight: "600", fontSize: 15, color: colors.text, marginTop: space[5], marginBottom: space[2] },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  actions: { flexDirection: "row", alignItems: "center", gap: space[3], marginTop: space[6] },
});
