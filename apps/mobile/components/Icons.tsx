import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

interface IconProps {
  size?: number;
  color?: string;
}

const strokeProps = {
  fill: "none",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ChatIcon({ size = 19, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 4V5z"
        stroke={color}
        {...strokeProps}
      />
    </Svg>
  );
}

export function DashboardIcon({ size = 19, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="4" y="10" width="3.4" height="10" fill={color} />
      <Rect x="10.3" y="5" width="3.4" height="15" fill={color} />
      <Rect x="16.6" y="2" width="3.4" height="18" fill={color} />
    </Svg>
  );
}

export function FoodsIcon({ size = 19, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11" stroke={color} {...strokeProps} />
    </Svg>
  );
}

export function AnalysisIcon({ size = 19, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="10.5" cy="10.5" r="6" stroke={color} {...strokeProps} />
      <Line x1="20" y1="20" x2="15.5" y2="15.5" stroke={color} {...strokeProps} />
    </Svg>
  );
}

export function NutrientsIcon({ size = 19, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 21c9 0 14-5 14-14 0-1-1-2-2-2C8 5 3 10 3 19c0 1 1 2 2 2z"
        stroke={color}
        {...strokeProps}
      />
    </Svg>
  );
}

export function SettingsIcon({ size = 19, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="3" stroke={color} {...strokeProps} />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={color}
        {...strokeProps}
      />
    </Svg>
  );
}

export function CameraIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 8h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"
        stroke={color}
        {...strokeProps}
      />
      <Circle cx="12" cy="13" r="4" stroke={color} {...strokeProps} />
    </Svg>
  );
}

export function GalleryIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="4" width="18" height="16" rx="2" stroke={color} {...strokeProps} />
      <Circle cx="8.5" cy="9.5" r="1.8" stroke={color} {...strokeProps} />
      <Path d="m4 17 5-5 5 5 2.5-2.5L20 18" stroke={color} {...strokeProps} />
    </Svg>
  );
}

export function SendIcon({ size = 16, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22 2 11 13" stroke={color} {...strokeProps} strokeWidth={1.9} />
      <Path d="M22 2 15 22l-4-9-9-4 20-7z" stroke={color} {...strokeProps} strokeWidth={1.9} />
    </Svg>
  );
}

export function CheckIcon({ size = 15, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 6 9 17l-5-5" stroke={color} {...strokeProps} strokeWidth={2.2} />
    </Svg>
  );
}

export function CloseIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 6 6 18" stroke={color} {...strokeProps} strokeWidth={2} />
      <Path d="M6 6l12 12" stroke={color} {...strokeProps} strokeWidth={2} />
    </Svg>
  );
}

export function PencilIcon({ size = 15, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 20h9" stroke={color} {...strokeProps} strokeWidth={1.8} />
      <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" stroke={color} {...strokeProps} strokeWidth={1.8} />
    </Svg>
  );
}
