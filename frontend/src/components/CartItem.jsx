import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';

function CartItem({ item, onIncrease, onDecrease, onRemove }) {
  return (
    <Box>
      <Box style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
      }}>
        <Box style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={item.image || 'https://via.placeholder.com/60x60?text=No+Image'}
            alt={item.name}
            style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }}
          />
          <Box>
            <Typography variant="subtitle1" fontWeight="bold">
              {item.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.discounted_price} تومان
            </Typography>
          </Box>
        </Box>

        <Box style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <IconButton onClick={() => onDecrease(item)} size="small">
            <RemoveIcon />
          </IconButton>
          <Typography variant="body1" fontWeight="bold">
            {item.quantity}
          </Typography>
          <IconButton onClick={() => onIncrease(item)} size="small">
            <AddIcon />
          </IconButton>
          <IconButton onClick={() => onRemove(item)} size="small" color="error">
            <DeleteIcon />
          </IconButton>
        </Box>
      </Box>
      <Divider />
    </Box>
  );
}

export default CartItem;