import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { muted } from '@/lib/ui';

const COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'];

export function MacroBreakdownChart({ data }: { data: { name: string; value: number }[] }) {
  const hasData = data.some(d => d.value > 0);

  return (
    <div className="card elev-sm" style={{ height: 280, padding: "var(--space-4)" }}>
      <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: muted(60), marginBottom: "var(--space-4)" }}>Today's Macros</h4>
      <div style={{ height: 200, width: "100%" }}>
        {!hasData ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: muted(), fontSize: 13 }}>
            No macros logged today
          </div>
        ) : (
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${Math.round(value)}g`} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
