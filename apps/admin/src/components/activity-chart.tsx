'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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

// en-GB day-month tick, e.g. "21 Jun".
function tickLabel(date: string) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fullTickLabel(date: string) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const hasData = data.some((d) => d.messages > 0 || d.events > 0);
  if (!hasData) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        No activity recorded in the last 90 days yet.
      </div>
    );
  }
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
        <CartesianGrid vertical={false} stroke="hsl(240 5% 14%)" strokeDasharray="3 3" />
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
          allowDecimals={false}
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
          labelFormatter={(d) => fullTickLabel(String(d))}
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="plainline"
          wrapperStyle={{ fontSize: 12, color: 'hsl(240 5% 65%)' }}
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
