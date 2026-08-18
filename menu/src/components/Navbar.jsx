// src/components/Navbar.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Badge,
  Box,
} from '@mui/material';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PersonIcon from '@mui/icons-material/Person';

const T = {
  glassBg:    'rgba(18, 19, 26, 0.85)',
  glassBorder:'rgba(255, 110, 40, 0.12)',
  accent:     '#ff6e28',
  accentHot:  '#ff4500',
  text:       '#ffffff',
  textMuted:  '#94a3b8',
  glow:       'rgba(255, 110, 40, 0.3)',
};

const navCss = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Vazirmatn:wght@400;700;900&display=swap');

  .nav-container {
    width: 100%;
    margin-bottom: 20px;
  }

  .nav-container * {
    font-family: 'Vazirmatn', sans-serif;
  }

  .glass-nav {
    background: ${T.glassBg} !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1px solid ${T.glassBorder} !important;
    border-radius: 20px !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
    overflow: hidden;
  }

  .brand-text {
    font-family: 'Cinzel', serif !important;
    font-weight: 900 !important;
    font-size: 1.5rem !important;
    letter-spacing: 0.05em;
    color: #ffffff;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
  }

  .brand-icon {
    color: ${T.accent};
    filter: drop-shadow(0 0 6px ${T.accent});
  }

  .nav-btn {
    color: ${T.textMuted} !important;
    font-weight: 700 !important;
    font-size: 0.95rem !important;
    padding: 8px 20px !important;
    border-radius: 50px !important;
    transition: all 0.3s ease !important;
    margin: 0 6px !important;
  }

  .nav-btn.active {
    color: #ffffff !important;
    background: linear-gradient(135deg, ${T.accent}, ${T.accentHot}) !important;
    box-shadow: 0 0 15px ${T.glow};
  }

  .nav-btn:hover:not(.active) {
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.05) !important;
  }

  .icon-btn {
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    transition: all 0.3s ease !important;
    padding: 10px !important;
    border-radius: 50px !important;
  }

  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.1) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
    transform: translateY(-1px);
  }
`;

const API = import.meta.env.VITE_API_URL || '';

function Navbar({ cartCount = 0 }) {
  const location = useLocation();

  return (
    <Box className="nav-container" dir="rtl">
      <style>{navCss}</style>

      <AppBar position="static" className="glass-nav" elevation={0}>
        <Toolbar sx={{ justifyContent: 'space-between', padding: '10px 24px', direction: 'rtl' }}>

          {/* سمت راست: لوگو */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RestaurantMenuIcon className="brand-icon" sx={{ fontSize: '1.7rem' }} />
            <Typography variant="h6" component="div" className="brand-text">
              LUMIÈRE
            </Typography>
          </Box>

          {/* سمت چپ: منو، سبد خرید، ورود */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>

            <Button
              component={Link}
              to="/menu"
              className={`nav-btn ${location.pathname === '/' || location.pathname === '/menu' ? 'active' : ''}`}
            >
              منو
            </Button>

            {/* سبد خرید */}
            <IconButton
              component={Link}
              to="/cart"
              className="icon-btn"
            >
              <Badge
                badgeContent={cartCount}
                sx={{
                  '& .MuiBadge-badge': {
                    background: `linear-gradient(135deg, ${T.accent}, ${T.accentHot})`,
                    color: '#ffffff',
                    fontWeight: '700',
                    boxShadow: '0 0 8px rgba(255, 110, 40, 0.5)',
                  },
                }}
              >
                <ShoppingCartIcon sx={{ fontSize: '1.3rem' }} />
              </Badge>
            </IconButton>

            {/* ورود / ادمک */}
            <IconButton
              component="a"
              href={API}
              className="icon-btn"
              sx={{ marginLeft: '8px' }}
            >
              <PersonIcon sx={{ fontSize: '1.3rem' }} />
            </IconButton>

          </Box>

        </Toolbar>
      </AppBar>
    </Box>
  );
}

export default Navbar;