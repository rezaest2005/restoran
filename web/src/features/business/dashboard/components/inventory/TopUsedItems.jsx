import GlassCard from '../common/GlassCard';

const TopUsedItems = ({ data }) => (
  <GlassCard>
    <h3 style={{ color: 'var(--on-primary)', margin: '0 0 1rem' }}>🏆 پرمصرف‌ترین مواد</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {data.map((item, index) => (
        <div
          key={item.name}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem',
            borderRadius: 10,
            background: index === 0 ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'var(--surface-sunken)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: index < 3 ? 'var(--success)' : 'var(--surface-sunken)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', color: 'var(--on-primary)', fontWeight: 700,
              }}
            >
              {index + 1}
            </span>
            <p style={{ color: 'var(--on-primary)', margin: 0, fontWeight: 600 }}>{item.name}</p>
          </div>
          <p style={{ color: 'var(--on-primary)', margin: 0, fontWeight: 600 }}>
            {item.used} {item.unit}
          </p>
        </div>
      ))}
    </div>
  </GlassCard>
);

export default TopUsedItems;
