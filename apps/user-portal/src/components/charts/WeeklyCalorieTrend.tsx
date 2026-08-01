import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { muted } from '@/lib/ui';

export function WeeklyCalorieTrend({ data }: { data: any[] }) {
  return (
    <div className="card elev-sm" style={{ height: 280, padding: "var(--space-4)" }}>
      <h4 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: muted(60), marginBottom: "var(--space-4)" }}>Weekly Calories</h4>
      <div style={{ height: 200, width: "100%" }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-divider)" />
            <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11, fill: muted(50) }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: muted(50) }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", fontSize: 13 }}
              formatter={(val: number) => Math.round(val)}
            />
            <Line type="monotone" dataKey="calories" stroke="var(--color-accent)" strokeWidth={3} dot={{ r: 4, fill: "var(--color-accent)", strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
