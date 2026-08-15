import React from 'react';
import { Box, Typography, Container } from '@mui/material';

function Footer() {
  return (
    <Box
      style={{
        background: '#1a1a2e',
        color: 'white',
        padding: '20px',
        marginTop: '40px',
        textAlign: 'center',
      }}
    >
      <Container>
        <Typography variant="h6" style={{ marginBottom: '10px' }}>
          رستوران ما
        </Typography>
        <Typography variant="body2">
          آدرس: تهران، خیابان ولیعصر
        </Typography>
        <Typography variant="body2">
          تلفن: ۰۲۱-۱۲۳۴۵۶۷۸
        </Typography>
        <Typography variant="body2" style={{ marginTop: '10px' }}>
          © 2026 تمام حقوق محفوظ است
        </Typography>
      </Container>
    </Box>
  );
}

export default Footer;