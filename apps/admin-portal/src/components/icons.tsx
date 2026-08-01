type IconProps = { size?: number };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function OverviewIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="10" width="3.4" height="10" />
      <rect x="10.3" y="5" width="3.4" height="15" />
      <rect x="16.6" y="2" width="3.4" height="18" />
    </svg>
  );
}

export function UsersIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M15.2 20c.2-2.2 1.6-4.2 4-4.4" />
    </svg>
  );
}

export function AuditIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3h6v2H9z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

export function LlmIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="9.5" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <path d="M9 15h6" />
    </svg>
  );
}
