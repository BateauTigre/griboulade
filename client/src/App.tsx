import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Gallery, History } from './pages/Archive';
import { Create, Join } from './pages/CreateJoin';
import { Home } from './pages/Home';
import { Room } from './pages/room/Room';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Accolades obligatoires : scrollTo peut renvoyer une promesse, que React prendrait pour un nettoyage.
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/creer" element={<Create />} />
        <Route path="/rejoindre" element={<Join />} />
        <Route path="/rejoindre/:code" element={<Join />} />
        <Route path="/salon/:code" element={<Room />} />
        <Route path="/historique" element={<History />} />
        <Route path="/galerie/:id" element={<Gallery />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
