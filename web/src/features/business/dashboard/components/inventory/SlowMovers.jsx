import GlassCard from '../common/GlassCard';

const SlowMovers = ({ data }) => (
  <GlassCard>
    <h3 style={{ color: 'var(--on-primary)', margin: '0 0 1rem' }}>📉 کندترین گردش کالا</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {data.map((item) => (
        <div
          key={item.name}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem',
            borderRadius: 10,
            background: 'var(--surface-sunken)',
          }}
        >
          <div>
            <p style={{ color: 'var(--on-primary)', margin: 0, fontWeight: 600 }}>{item.name}</p>
            <p style={{ color: 'var(--on-primary)', margin: 0, fontSize: '0.85rem' }}>
              آخرین مصرف: {item.lastUsed}
            </p>
          </div>
          <p style={{ color: 'var(--warning)', margin: 0, fontWeight: 600 }}>
            {item.quantity} {item.unit}
          </p>
        </div>
      ))}
    </div>
  </GlassCard>
);

export default SlowMovers;
