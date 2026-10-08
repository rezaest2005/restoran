import React from 'react';
import GlassCard from '../common/GlassCard';
import ChangeChip from '../common/ChangeChip';

const WeeklyInventoryComp = ({ data }) => {
  const rows = [
    { label: 'ارزش موجودی', thisWeek: data.thisWeekStock, lastWeek: data.lastWeekStock, change: data.stockChange, currency: true },
    { label: 'ورودی کالا', thisWeek: data.thisWeekInbound, lastWeek: data.lastWeekInbound, change: data.inboundChange },
    { label: 'ضایعات', thisWeek: data.thisWeekWaste, lastWeek: data.lastWeekWaste, change: data.wasteChange },
  ];

  return (
    <GlassCard>
      <h3 style={{ color: '#fff', margin: '0 0 1.5rem' }}>📅 مقایسه هفتگی انبار</h3>
      {rows.map((row) => (
        <div
          key={row.label}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr auto',
            gap: '1rem',
            padding: '1rem 0',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            alignItems: 'center',
          }}
        >
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: '0.9rem' }}>{row.label}</p>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)', margin: 0, fontSize: '0.75rem' }}>این هفته</p>
            <p style={{ color: '#fff', margin: 0, fontWeight: 700 }}>
              {row.currency ? Number(row.thisWeek).toLocaleString('fa-IR') : row.thisWeek}
            </p>
          </div>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)', margin: 0, fontSize: '0.75rem' }}>هفته قبل</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontWeight: 600 }}>
              {row.currency ? Number(row.lastWeek).toLocaleString('fa-IR') : row.lastWeek}
            </p>
          </div>
          <ChangeChip value={row.change} />
        </div>
      ))}
    </GlassCard>
  );
};

export default WeeklyInventoryComp;
