import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Menu from './pages/Menu';
import Cart from './pages/Cart';
import Reservation from './pages/Reservation';
import OrderTracking from './pages/OrderTracking';

function App() {
  const [cart, setCart] = useState([]);

  const handleAddToCart = (food) => {
    const existing = cart.find(item => item.id === food.id);
    if (existing) {
      setCart(cart.map(item =>
        item.id === food.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...food, quantity: 1 }]);
    }
  };

  const handleIncrease = (food) => {
    setCart(cart.map(item =>
      item.id === food.id
        ? { ...item, quantity: item.quantity + 1 }
        : item
    ));
  };

  const handleDecrease = (food) => {
    if (food.quantity === 1) {
      setCart(cart.filter(item => item.id !== food.id));
    } else {
      setCart(cart.map(item =>
        item.id === food.id
          ? { ...item, quantity: item.quantity - 1 }
          : item
      ));
    }
  };

  const handleRemove = (food) => {
    setCart(cart.filter(item => item.id !== food.id));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Router>
      <Navbar cartCount={totalItems} />
      <Routes>
        <Route path="/" element={
          <Menu
            onAddToCart={handleAddToCart}
            cartCount={totalItems}
          />
        }/>
        <Route path="/menu" element={
          <Menu
            onAddToCart={handleAddToCart}
            cartCount={totalItems}
          />
        }/>
        <Route path="/cart" element={
          <Cart
            cart={cart}
            onIncrease={handleIncrease}
            onDecrease={handleDecrease}
            onRemove={handleRemove}
            onClearCart={handleClearCart}
          />
        }/>
        <Route path="/reservation" element={<Reservation />} />
        <Route path="/tracking" element={<OrderTracking />} />
      </Routes>
    </Router>
  );
}

export default App;