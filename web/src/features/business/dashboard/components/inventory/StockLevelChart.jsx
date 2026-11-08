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
    <h3 style={{ color: 'var(--on-primary)', margin: '0 0 1rem' }}>📊 سطح موجودی انبار</h3>
    <p style={{ color: 'var(--on-primary)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
      نوار سبز = موجودی فعلی | نوار قرمز = حداقل مورد نیاز
    </p>
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis type="number" stroke="var(--on-primary)" fontSize={12} />
        <YAxis dataKey="name" type="category" stroke="var(--on-primary)" fontSize={12} width={80} />
        <Tooltip
          contentStyle={{
            background: 'color-mix(in srgb, var(--ink) 95%, transparent)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            color: 'var(--on-primary)',
          }}
          formatter={(value, name) => [
            value,
            name === 'current' ? 'موجودی فعلی' : 'حداقل نیاز',
          ]}
        />
        <Bar dataKey="min" fill="var(--danger)" radius={[0, 6, 6, 0]} opacity={0.5} />
        <Bar dataKey="current" fill="var(--success)" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </GlassCard>
);

export default StockLevelChart;
