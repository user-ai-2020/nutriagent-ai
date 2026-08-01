import { ReactNode } from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { colors, fonts, radius, serif, shadow, space, textMuted } from "@/theme/tokens";

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({
  children,
  elevation = "sm",
  style,
}: {
  children: ReactNode;
  elevation?: "none" | "sm" | "md";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, elevation !== "none" && shadow[elevation], style]}>{children}</View>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <Text style={styles.kicker}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Heading({ size = 22, children, style }: { size?: number; children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[serif(size), style]}>{children}</Text>;
}

export function Tag({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: "neutral" | "accent" | "accent2" | "outline";
}) {
  return (
    <View style={[styles.tag, styles[`tag_${variant}`]]}>
      <Text style={[styles.tagText, styles[`tagText_${variant}`]]}>{children}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      style={[styles.btn, styles[`btn_${variant}`], (disabled || loading) && styles.btnDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.bg : colors.accent} />
      ) : (
        <Text style={[styles.btnText, styles[`btnText_${variant}`]]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function IconButton({
  children,
  onPress,
  variant = "primary",
  disabled,
}: {
  children: ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.iconBtn, styles[`btn_${variant}`], disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {children}
    </TouchableOpacity>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={textMuted[50]}
        {...props}
      />
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput style={[styles.input, props.style]} placeholderTextColor={textMuted[50]} {...props} />;
}

export function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.pill, active && styles.pillOn]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.pillText, active && styles.pillTextOn]}>{active ? `${label} ✓` : label}</Text>
    </TouchableOpacity>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.seg, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segOpt, active && styles.segOptActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Radio({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.radio} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.radioDot, checked && styles.radioDotOn]} />
      <Text style={styles.radioLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space[4],
    gap: space[2],
  },
  kicker: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: textMuted[50],
  },
  muted: { fontFamily: fonts.body, fontSize: 12.5, color: textMuted[55] },

  tag: {
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tag_neutral: { backgroundColor: colors.neutral200 },
  tag_accent: { backgroundColor: colors.accent100 },
  tag_accent2: { backgroundColor: colors.accent2100 },
  tag_outline: { borderColor: colors.divider },
  tagText: { fontFamily: fonts.body, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase" },
  tagText_neutral: { color: textMuted[70] },
  tagText_accent: { color: colors.accent700 },
  tagText_accent2: { color: colors.accent2700 },
  tagText_outline: { color: textMuted[70], textTransform: "none", letterSpacing: 0, fontSize: 11 },

  btn: {
    paddingHorizontal: space[4],
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  btn_primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btn_secondary: { borderColor: colors.divider },
  btn_ghost: {},
  btn_danger: { borderColor: colors.accent2 },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontFamily: fonts.body, fontSize: 14 },
  btnText_primary: { color: colors.bg },
  btnText_secondary: { color: colors.text },
  btnText_ghost: { color: colors.text },
  btnText_danger: { color: colors.accent2700 },

  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },

  field: { marginBottom: space[3] },
  fieldLabel: { fontFamily: fonts.body, fontSize: 12.5, color: textMuted[70], marginBottom: 5 },
  input: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: 10,
  },

  pill: {
    paddingHorizontal: space[4],
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.divider,
  },
  pillOn: { borderColor: colors.accent, backgroundColor: colors.accent100 },
  pillText: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  pillTextOn: { color: colors.accent700 },

  seg: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.neutral100,
    gap: 2,
  },
  segOpt: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  segOptActive: { backgroundColor: colors.surface, ...shadow.sm },
  segText: { fontFamily: fonts.body, fontSize: 12.5, color: textMuted[70] },
  segTextActive: { color: colors.accent700 },

  radio: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 6 },
  radioDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.neutral400 },
  radioDotOn: { borderWidth: 5, borderColor: colors.accent },
  radioLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
});
