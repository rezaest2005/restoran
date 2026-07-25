import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Typography,
  Box,
  TextField,
  Button,
  Paper,
  Grid,
  MenuItem,
  Alert,
} from '@mui/material';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';

const API = import.meta.env.VITE_API_URL || '';

function Reservation() {
  const [tables, setTables] = useState([]);
  const [formData, setFormData] = useState({
    customer_name: '',
    phone: '',
    table: '',
    date: '',
    time: '',
    guests: '',
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API}/api/tables/`)
      .then(response => {
        setTables(response.data.filter(table => !table.is_reserved));
      })
      .catch(error => console.log(error));
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = () => {
    if (!formData.customer_name || !formData.phone || !formData.table || !formData.date || !formData.time || !formData.guests) {
      setError('لطفاً همه فیلدها را پر کنید');
      return;
    }

    axios.post(`${API}/api/reservations/`, formData)
      .then(response => {
        setSuccess(true);
        setError('');
        setFormData({
          customer_name: '',
          phone: '',
          table: '',
          date: '',
          time: '',
          guests: '',
        });
      })
      .catch(error => {
        setError('خطا در ثبت رزرو');
      });
  };

  return (
    <Container style={{ padding: '40px 20px' }}>
      <Box textAlign="center" marginBottom="40px">
        <TableRestaurantIcon style={{ fontSize: '60px', color: '#1a1a2e' }} />
        <Typography variant="h4" fontWeight="bold">
          رزرو میز
        </Typography>
        <Typography variant="body1" color="text.secondary">
          میز مورد نظر خود را رزرو کنید
        </Typography>
      </Box>

      <Paper style={{ maxWidth: '600px', margin: '0 auto', padding: '30px' }}>
        {success && (
          <Alert severity="success" style={{ marginBottom: '20px' }}>
            رزرو شما با موفقیت ثبت شد!
          </Alert>
        )}
        {error && (
          <Alert severity="error" style={{ marginBottom: '20px' }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="نام و نام خانوادگی"
              name="customer_name"
              fullWidth
              value={formData.customer_name}
              onChange={handleChange}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="شماره تلفن"
              name="phone"
              fullWidth
              value={formData.phone}
              onChange={handleChange}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="تاریخ"
              name="date"
              type="date"
              fullWidth
              value={formData.date}
              onChange={handleChange}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="ساعت"
              name="time"
              type="time"
              fullWidth
              value={formData.time}
              onChange={handleChange}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="تعداد نفرات"
              name="guests"
              type="number"
              fullWidth
              value={formData.guests}
              onChange={handleChange}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="انتخاب میز"
              name="table"
              fullWidth
              value={formData.table}
              onChange={handleChange}
            >
              {tables.map(table => (
                <MenuItem key={table.id} value={table.id}>
                  میز {table.number} - ظرفیت {table.capacity} نفر
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={handleSubmit}
              style={{ background: '#1a1a2e', padding: '12px' }}
            >
              ثبت رزرو
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
}

export default Reservation;