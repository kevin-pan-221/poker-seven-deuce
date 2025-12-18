/**
 * sevendeuce - Main App Component
 * Casual poker table UI with 8-bit retro styling
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import { HomePage, GamePage } from './pages';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/game/:roomId" element={<GamePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
