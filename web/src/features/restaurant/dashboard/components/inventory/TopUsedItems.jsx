import React from 'react';
import GlassCard from '../common/GlassCard';

const TopUsedItems = ({ data }) => (
  <GlassCard>
    <h3 style={{ color: '#fff', margin: '0 0 1rem' }}>🏆 پرمصرف‌ترین مواد</h3>
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
            background: index === 0 ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: index < 3 ? '#10B981' : 'rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', color: '#fff', fontWeight: 700,
              }}
            >
              {index + 1}
            </span>
            <p style={{ color: '#fff', margin: 0, fontWeight: 600 }}>{item.name}</p>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, fontWeight: 600 }}>
            {item.used} {item.unit}
          </p>
        </div>
      ))}
    </div>
  </GlassCard>
);

export default TopUsedItems;
