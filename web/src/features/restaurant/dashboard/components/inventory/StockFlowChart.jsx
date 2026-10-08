import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import GlassCard from '../common/GlassCard';

const StockFlowChart = ({ data }) => (
  <GlassCard>
    <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>📈 جریان ورود و خروج کالا</h3>
    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
      سبز = ورود کالا | نارنجی = خروج کالا
    </p>
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
        <XAxis dataKey="day" stroke="rgba(255,255,255,0.5)" fontSize={12} />
        <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
        <Tooltip
          contentStyle={{
            background: 'rgba(30,30,50,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            color: '#fff',
          }}
          formatter={(value, name) => [`${value} کیلو`, name === 'inbound' ? 'ورود' : 'خروج']}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
              {value === 'inbound' ? 'ورود' : 'خروج'}
            </span>
          )}
        />
        <Bar dataKey="inbound" fill="#10B981" radius={[6, 6, 0, 0]} />
        <Bar dataKey="outbound" fill="#D97706" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </GlassCard>
);

export default StockFlowChart;
