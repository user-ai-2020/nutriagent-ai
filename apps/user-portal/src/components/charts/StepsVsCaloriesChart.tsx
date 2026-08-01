import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { muted } from '@/lib/ui';

export function StepsVsCaloriesChart({ data }: { data: any[] }) {
  return (
    <div className="card elev-sm" style={{ height: 280, padding: "var(--space-4)" }}>
      <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: muted(60), marginBottom: "var(--space-4)" }}>Steps & Burn</h4>
      <div style={{ height: 200, width: "100%" }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-divider)" />
            <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11, fill: muted(50) }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: muted(50) }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: muted(50) }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", fontSize: 13 }}
            />
            <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="steps" name="Steps" fill="var(--color-accent-200)" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="caloriesBurned" name="Calories Burned" stroke="#f59e0b" strokeWidth={3} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
