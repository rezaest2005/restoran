import GlassCard from '../common/GlassCard';

const SEVERITY_COLORS = {
  critical: 'var(--danger)',
  warning: 'var(--warning)',
  ok: 'var(--success)',
};

const ExpiringItems = ({ data }) => (
  <GlassCard>
    <h3 style={{ color: 'var(--on-primary)', margin: '0 0 1rem' }}>⏰ کالاهای نزدیک به انقضا</h3>
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
            borderRight: `4px solid ${SEVERITY_COLORS[item.severity]}`,
          }}
        >
          <div>
            <p style={{ color: 'var(--on-primary)', margin: 0, fontWeight: 600 }}>{item.name}</p>
            <p style={{ color: 'var(--on-primary)', margin: 0, fontSize: '0.85rem' }}>
              {item.quantity} {item.unit}
            </p>
          </div>
          <div
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              background: `${SEVERITY_COLORS[item.severity]}22`,
              color: SEVERITY_COLORS[item.severity],
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {item.expiry}
          </div>
        </div>
      ))}
    </div>
  </GlassCard>
);

export default ExpiringItems;
