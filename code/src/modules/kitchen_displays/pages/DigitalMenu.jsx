import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `$${amount.toFixed(2)}`;
}

export default function DigitalMenu() {
  const { location } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data: recipes, isLoading } = useQuery({
    queryKey: ['digital-menu', location?.id],
    queryFn: () => api.entities.Recipe.list('name', {
      select: 'name, suggested_price, cost_per_serving, instructions, yield_unit',
      limit: 10
    }),
    enabled: !!location?.id,
  });

  useEffect(() => {
    if (!recipes || recipes.length === 0) return undefined;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % recipes.length);
    }, 10000);

    return () => clearInterval(timer);
  }, [recipes]);

  if (!location) {
    return <div className="min-h-screen bg-black text-white p-8 text-center">Please log in to cast Digital Menu</div>;
  }

  if (isLoading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center text-4xl animate-pulse">Loading Menu...</div>;
  }

  if (!recipes || recipes.length === 0) {
    return (
      <div className="fixed inset-0 bg-black text-white overflow-hidden font-sans">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand via-black to-black" />
        <div className="relative h-full flex flex-col items-center justify-center p-12 text-center">
          <p className="text-lg uppercase tracking-[0.35em] text-brand mb-6">Digital Menu</p>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight max-w-5xl">No active menu items</h1>
          <p className="mt-8 text-2xl text-slate-300 max-w-3xl">Publish recipes with menu pricing to show them on this display.</p>
        </div>
      </div>
    );
  }

  const currentItem = recipes[currentIndex];
  const menuPrice = formatCurrency(currentItem.suggested_price);
  const cost = formatCurrency(currentItem.cost_per_serving);

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden font-sans">
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand via-black to-black" />
      
      <div className="relative h-full flex flex-col items-center justify-center p-16 text-center animate-fade-in">
        <h1 className="text-7xl md:text-8xl font-black mb-8 tracking-tight drop-shadow-2xl">
          {currentItem.name}
        </h1>
        
        {menuPrice ? (
          <div className="text-6xl font-bold text-brand mb-12 drop-shadow-xl">{menuPrice}</div>
        ) : cost ? (
          <div className="text-2xl font-semibold text-slate-300 mb-12 drop-shadow-xl">Cost per {currentItem.yield_unit || 'serving'}: {cost}</div>
        ) : null}
        
        <p className="text-4xl text-slate-300 max-w-4xl leading-snug font-light">
          {currentItem.instructions || 'Prepared fresh by our kitchen team.'}
        </p>

        <div className="absolute bottom-12 flex gap-4">
          {recipes.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-2 rounded-full transition-all duration-500 ${idx === currentIndex ? 'w-16 bg-brand' : 'w-4 bg-slate-600'}`} 
            />
          ))}
        </div>
      </div>
    </div>
  );
}