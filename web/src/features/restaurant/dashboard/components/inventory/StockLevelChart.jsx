import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import GlassCard from '../common/GlassCard';

const StockLevelChart = ({ data }) => (
  <GlassCard>
    <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>📊 سطح موجودی انبار</h3>
    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
      نوار سبز = موجودی فعلی | نوار قرمز = حداقل مورد نیاز
    </p>
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
        <XAxis type="number" stroke="rgba(255,255,255,0.5)" fontSize={12} />
        <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.5)" fontSize={12} width={80} />
        <Tooltip
          contentStyle={{
            background: 'rgba(30,30,50,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            color: '#fff',
          }}
          formatter={(value, name) => [
            value,
            name === 'current' ? 'موجودی فعلی' : 'حداقل نیاز',
          ]}
        />
        <Bar dataKey="min" fill="#EF4444" radius={[0, 6, 6, 0]} opacity={0.5} />
        <Bar dataKey="current" fill="#10B981" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </GlassCard>
);

export default StockLevelChart;
