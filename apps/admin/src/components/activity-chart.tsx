'use client';

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ActivityPoint {
  date: string;
  messages: number;
  events: number;
}

function tickLabel(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="fillMessages" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(234 89% 74%)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(234 89% 74%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fillEvents" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(190 80% 60%)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="hsl(190 80% 60%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={tickLabel}
          minTickGap={48}
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'hsl(240 5% 50%)', fontSize: 11 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fill: 'hsl(240 5% 50%)', fontSize: 11 }}
        />
        <Tooltip
          cursor={{ stroke: 'hsl(240 5% 25%)', strokeWidth: 1 }}
          contentStyle={{
            background: 'hsl(240 9% 8%)',
            border: '1px solid hsl(240 5% 16%)',
            borderRadius: 10,
            fontSize: 12,
            color: 'hsl(0 0% 92%)',
          }}
          labelFormatter={(d) => tickLabel(String(d))}
        />
        <Area
          type="monotone"
          dataKey="messages"
          stroke="hsl(234 89% 74%)"
          strokeWidth={2}
          fill="url(#fillMessages)"
          name="Messages"
        />
        <Area
          type="monotone"
          dataKey="events"
          stroke="hsl(190 80% 60%)"
          strokeWidth={1.5}
          fill="url(#fillEvents)"
          name="Events"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
