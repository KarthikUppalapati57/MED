import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

export default function DigitalMenu() {
  const { location } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Fetch active recipes to display as menu items
  const { data: recipes, isLoading } = useQuery({
    queryKey: ['digital-menu', location?.id],
    queryFn: () => api.entities.Recipe.list('name', {
      select: 'name, cost_per_serving, instructions',
      limit: 10
    }),
    enabled: !!location?.id,
  });

  // Carousel timer
  useEffect(() => {
    if (!recipes || recipes.length === 0) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % recipes.length);
    }, 10000); // Rotate every 10 seconds

    return () => clearInterval(timer);
  }, [recipes]);

  if (!location) {
    return <div className="min-h-screen bg-black text-white p-8 text-center">Please log in to cast Digital Menu</div>;
  }

  if (isLoading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center text-4xl animate-pulse">Loading Menu...</div>;
  }

  if (!recipes || recipes.length === 0) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center text-4xl">Menu coming soon...</div>;
  }

  const currentItem = recipes[currentIndex];

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden font-sans">
      {/* Background image / abstract styling */}
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand via-black to-black"></div>
      
      <div className="relative h-full flex flex-col items-center justify-center p-16 text-center animate-fade-in">
        <h1 className="text-8xl font-black mb-8 tracking-tighter drop-shadow-2xl">
          {currentItem.name}
        </h1>
        
        {/* We use cost_per_serving as a mock for menu price just for the demo */}
        <div className="text-6xl font-bold text-brand mb-12 drop-shadow-xl">
          ${(Number(currentItem.cost_per_serving || 0) * 3).toFixed(2)}
        </div>
        
        <p className="text-4xl text-slate-300 max-w-4xl leading-snug font-light">
          {currentItem.instructions || "Freshly prepared daily using the finest ingredients."}
        </p>

        {/* Carousel indicators */}
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
