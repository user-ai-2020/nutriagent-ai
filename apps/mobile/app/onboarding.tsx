import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { applyRestrictions, DIET_TYPES, RESTRICTIONS, RestrictionId } from "@/lib/profile";
import { Button, Field, Kicker, Pill, Radio } from "@/components/ui";
import { colors, fonts, radius, serif, shadow, space, textMuted } from "@/theme/tokens";

const STEPS = [
  { title: "Set your daily goals", hint: "You can fine-tune these later in Settings." },
  { title: "Any health restrictions?", hint: "We'll filter recommendations accordingly." },
  { title: "Pick a diet style", hint: "This shapes the advice the agents give you." },
];

export default function OnboardingScreen() {
  const { token } = useAuth();
  const [step, setStep] = useState(0);
  const [calories, setCalories] = useState("2200");
  const [protein, setProtein] = useState("130");
  const [restrictions, setRestrictions] = useState<RestrictionId[]>([]);
  const [dietType, setDietType] = useState("balanced");
  const [loading, setLoading] = useState(false);

  function toggle(id: RestrictionId) {
    setRestrictions((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function finish() {
    setLoading(true);
    try {
      if (token) {
        await api(
          "/api/profile",
          token,
          {
            method: "PUT",
            body: JSON.stringify(
              applyRestrictions(
                {
                  dietType,
                  dietGoals: {
                    dailyCalories: Number(calories) || 2200,
                    proteinGrams: Number(protein) || 130,
                    carbsGrams: 250,
                    fatGrams: 70,
                  },
                },
                restrictions
              )
            ),
          }
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      router.replace("/(tabs)/chat");
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Kicker>{`Step ${step + 1} of ${STEPS.length}`}</Kicker>
        <Text style={serif(24, { lineHeight: 28 })}>{STEPS[step].title}</Text>
        <Text style={styles.hint}>{STEPS[step].hint}</Text>

        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i <= step && styles.dotOn]} />
          ))}
        </View>

        {step === 0 && (
          <View>
            <Field
              label="Calorie goal (kcal/day)"
              keyboardType="numeric"
              value={calories}
              onChangeText={setCalories}
            />
            <Field label="Protein goal (g/day)" keyboardType="numeric" value={protein} onChangeText={setProtein} />
          </View>
        )}

        {step === 1 && (
          <View style={styles.pillRow}>
            {RESTRICTIONS.map((r) => (
              <Pill key={r.id} label={r.label} active={restrictions.includes(r.id)} onPress={() => toggle(r.id)} />
            ))}
          </View>
        )}

        {step === 2 && (
          <View>
            {DIET_TYPES.map((d) => (
              <Radio key={d.id} label={d.label} checked={dietType === d.id} onPress={() => setDietType(d.id)} />
            ))}
          </View>
        )}

        <View style={styles.nav}>
          {step > 0 && (
            <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />
          )}
          <Button
            title={step < STEPS.length - 1 ? "Continue" : "Start using NutriAgent"}
            onPress={() => (step < STEPS.length - 1 ? setStep(step + 1) : finish())}
            loading={loading}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[5], paddingTop: space[8], flexGrow: 1, justifyContent: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6], ...shadow.md },
  hint: { fontFamily: fonts.body, fontSize: 13, color: textMuted[60], marginTop: 6 },
  dots: { flexDirection: "row", gap: 6, marginVertical: space[5] },
  dot: { width: 26, height: 4, borderRadius: 2, backgroundColor: colors.neutral300 },
  dotOn: { backgroundColor: colors.accent },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  nav: { flexDirection: "row", gap: space[3], marginTop: space[6] },
});
