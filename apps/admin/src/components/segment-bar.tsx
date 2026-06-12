'use client';

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { AdvocateSegment } from '@prisma/client';
import { SEGMENT_META, SEGMENT_ORDER } from '@/lib/format';

const FILL: Record<AdvocateSegment, string> = {
  CHAMPION: 'hsl(258 90% 70%)',
  ADVOCATE: 'hsl(234 89% 74%)',
  ACTIVE: 'hsl(199 89% 64%)',
  CASUAL: 'hsl(240 5% 55%)',
  LURKER: 'hsl(240 5% 35%)',
};

export function SegmentBar({ data }: { data: { segment: AdvocateSegment; count: number }[] }) {
  const rows = SEGMENT_ORDER.map((segment) => ({
    segment,
    label: SEGMENT_META[segment].label,
    count: data.find((d) => d.segment === segment)?.count ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 28, bottom: 0, left: 8 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={76}
          tick={{ fill: 'hsl(240 5% 65%)', fontSize: 12 }}
        />
        <Bar dataKey="count" radius={[4, 4, 4, 4]} barSize={22}>
          {rows.map((r) => (
            <Cell key={r.segment} fill={FILL[r.segment]} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            fill="hsl(0 0% 80%)"
            fontSize={12}
            className="tabular-nums"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
