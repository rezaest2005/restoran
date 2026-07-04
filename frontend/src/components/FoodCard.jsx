import React from 'react';
import {
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Typography,
  Button,
  Chip,
  Box,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';

const API = import.meta.env.VITE_API_URL || 'http://192.168.240.235:8000';

function FoodCard({ food, onAddToCart }) {
  return (
    <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      <CardMedia
        component="img"
        height="200"
        image={
          food.image
            ? `${API}${food.image}`
            : 'https://via.placeholder.com/300x200?text=No+Image'
        }
        alt={food.name}
      />
      <CardContent style={{ flexGrow: 1 }}>
        <Typography variant="h6" gutterBottom>
          {food.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {food.description}
        </Typography>

        {food.adjustment_percentage > 0 ? (
          <Box>
            <Typography
              variant="body2"
              style={{ textDecoration: 'line-through', color: 'gray' }}
            >
              {Number(food.price).toLocaleString()} تومان
            </Typography>
            <Box style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Typography
                variant="h6"
                style={{
                  color: food.adjustment_type === 'discount' ? 'green' : 'red',
                  fontWeight: 'bold'
                }}
              >
                {Number(food.final_price).toLocaleString()} تومان
              </Typography>
              <Chip
                label={`${food.adjustment_percentage}% ${
                  food.adjustment_type === 'discount' ? 'تخفیف' : 'اضافه‌ بها'
                }`}
                color={food.adjustment_type === 'discount' ? 'error' : 'warning'}
                size="small"
              />
            </Box>
          </Box>
        ) : (
          <Typography variant="h6" style={{ color: '#1a1a2e', fontWeight: 'bold' }}>
            {Number(food.price).toLocaleString()} تومان
          </Typography>
        )}
      </CardContent>
      <CardActions>
        <Button
          variant="contained"
          fullWidth
          startIcon={<AddShoppingCartIcon />}
          onClick={() => onAddToCart(food)}
          style={{ background: '#1a1a2e' }}
        >
          افزودن به سبد
        </Button>
      </CardActions>
    </Card>
  );
}

export default FoodCard;