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
    <h3 style={{ color: 'var(--on-primary)', margin: '0 0 1rem' }}>📈 جریان ورود و خروج کالا</h3>
    <p style={{ color: 'var(--on-primary)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
      سبز = ورود کالا | نارنجی = خروج کالا
    </p>
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="day" stroke="var(--on-primary)" fontSize={12} />
        <YAxis stroke="var(--on-primary)" fontSize={12} />
        <Tooltip
          contentStyle={{
            background: 'color-mix(in srgb, var(--ink) 95%, transparent)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            color: 'var(--on-primary)',
          }}
          formatter={(value, name) => [`${value} کیلو`, name === 'inbound' ? 'ورود' : 'خروج']}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: 'var(--on-primary)', fontSize: 13 }}>
              {value === 'inbound' ? 'ورود' : 'خروج'}
            </span>
          )}
        />
        <Bar dataKey="inbound" fill="var(--success)" radius={[6, 6, 0, 0]} />
        <Bar dataKey="outbound" fill="var(--warning)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </GlassCard>
);

export default StockFlowChart;
