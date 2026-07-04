import React, { useState } from 'react';
import axios from 'axios';
import {
  Container,
  Typography,
  Box,
  TextField,
  Button,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

const API = import.meta.env.VITE_API_URL || 'http://192.168.240.235:8000';

const steps = [
  'در انتظار',
  'در حال آماده‌سازی',
  'آماده',
  'تحویل داده شده',
];

const statusMap = {
  'pending': 0,
  'preparing': 1,
  'ready': 2,
  'delivered': 3,
};

function OrderTracking() {
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  const handleSearch = () => {
    if (!orderId) {
      setError('لطفاً شماره سفارش را وارد کنید');
      return;
    }

    axios.get(`${API}/api/orders/${orderId}/`)
      .then(response => {
        setOrder(response.data);
        setError('');
      })
      .catch(error => {
        setError('سفارش پیدا نشد');
        setOrder(null);
      });
  };

  return (
    <Container style={{ padding: '40px 20px' }}>
      <Box textAlign="center" marginBottom="40px">
        <SearchIcon style={{ fontSize: '60px', color: '#1a1a2e' }} />
        <Typography variant="h4" fontWeight="bold">
          پیگیری سفارش
        </Typography>
        <Typography variant="body1" color="text.secondary">
          شماره سفارش خود را وارد کنید
        </Typography>
      </Box>

      <Paper style={{ maxWidth: '600px', margin: '0 auto', padding: '30px' }}>
        <Box style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <TextField
            label="شماره سفارش"
            fullWidth
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
          <Button
            variant="contained"
            onClick={handleSearch}
            style={{ background: '#1a1a2e', minWidth: '100px' }}
          >
            جستجو
          </Button>
        </Box>

        {error && (
          <Alert severity="error" style={{ marginBottom: '20px' }}>
            {error}
          </Alert>
        )}

        {order && (
          <Box>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              سفارش #{order.id}
            </Typography>
            <Typography variant="body1" gutterBottom>
              نام: {order.customer_name}
            </Typography>
            <Typography variant="body1" gutterBottom>
              جمع کل: {order.total_price} تومان
            </Typography>

            <Box style={{ marginTop: '30px' }}>
              <Stepper activeStep={statusMap[order.status]}>
                {steps.map(label => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>
            </Box>

            <Box style={{ marginTop: '20px' }}>
              <Typography variant="h6" gutterBottom>
                آیتم‌های سفارش:
              </Typography>
              {order.items.map(item => (
                <Box
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <Typography>غذا #{item.food}</Typography>
                  <Typography>تعداد: {item.quantity}</Typography>
                  <Typography>{item.price} تومان</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Paper>
    </Container>
  );
}

export default OrderTracking;