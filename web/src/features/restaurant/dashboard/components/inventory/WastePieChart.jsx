import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import GlassCard from '../common/GlassCard';

const WastePieChart = ({ data }) => (
  <GlassCard>
    <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>🥧 تفکیک ضایعات</h3>
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: 'rgba(30,30,50,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            color: '#fff',
          }}
          formatter={(value) => [`${value}%`, 'درصد ضایعات']}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  </GlassCard>
);

export default WastePieChart;
