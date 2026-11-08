import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import GlassCard from '../common/GlassCard';

const WastePieChart = ({ data }) => (
  <GlassCard>
    <h3 style={{ color: 'var(--on-primary)', margin: '0 0 1rem' }}>🥧 تفکیک ضایعات</h3>
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
            background: 'color-mix(in srgb, var(--ink) 95%, transparent)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            color: 'var(--on-primary)',
          }}
          formatter={(value) => [`${value}%`, 'درصد ضایعات']}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: 'var(--on-primary)', fontSize: 13 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  </GlassCard>
);

export default WastePieChart;
