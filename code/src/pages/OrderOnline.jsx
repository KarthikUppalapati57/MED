import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, Search, Plus, Trash2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function OrderOnline() {
  const { location } = useAuth();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);

  // Fetch active recipes to act as the menu
  const { data: menuItems, isLoading } = useQuery({
    queryKey: ['online-menu', location?.id],
    queryFn: () => api.entities.Recipe.list('name', {
      select: 'id, name, cost_per_serving, instructions',
      limit: 50
    }),
    enabled: !!location?.id,
  });

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...item, qty: 1 }];
    });
    toast.success(`${item.name} added to cart`);
  };

  const removeFromCart = (itemId) => {
    setCart(prev => prev.filter(i => i.id !== itemId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (Number(item.cost_per_serving || 0) * 3 * item.qty), 0);

  if (!location) {
    return <div className="p-8 text-center min-h-screen">Please select a location to view the ordering portal.</div>;
  }

  const filteredMenu = menuItems?.filter(i => i.name.toLowerCase().includes(search.toLowerCase())) || [];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Fake Consumer Header */}
      <header className="bg-white border-b sticky top-0 z-10 px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="text-2xl font-black tracking-tighter text-brand">RESTOPS<span className="text-slate-900">360</span> Eats</div>
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            className="pl-9 bg-slate-100 border-none rounded-full" 
            placeholder="Search for dishes..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 font-medium">
          <ShoppingBag className="h-5 w-5" />
          <span>{cart.reduce((sum, i) => sum + i.qty, 0)} items</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 flex gap-8">
        {/* Menu Grid */}
        <div className="flex-1">
          <h2 className="text-3xl font-bold mb-6">Our Menu</h2>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading delicious items...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMenu.map(item => {
                // Mock consumer price as 3x the cost
                const price = (Number(item.cost_per_serving || 0) * 3).toFixed(2);
                return (
                  <div key={item.id} className="bg-white rounded-2xl shadow-sm border overflow-hidden hover:shadow-md transition-all group flex flex-col">
                    {/* Mock Image Area */}
                    <div className="h-48 bg-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-slate-300 transition-colors">
                      <span className="font-medium">No Image</span>
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <h3 className="font-bold text-lg leading-tight mb-2">{item.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
                        {item.instructions || "Freshly prepared to order."}
                      </p>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="font-bold text-lg">${price}</span>
                        <Button onClick={() => addToCart(item)} size="sm" className="rounded-full px-4 gap-1">
                          <Plus className="h-4 w-4" /> Add
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Cart Sidebar */}
        <div className="w-96 hidden lg:block">
          <div className="bg-white rounded-2xl shadow-lg border p-6 sticky top-24">
            <h2 className="text-2xl font-bold mb-6">Your Order</h2>
            {cart.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                <ShoppingBag className="h-12 w-12 mb-4 opacity-20" />
                <p>Your cart is empty.</p>
              </div>
            ) : (
              <>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {cart.map(item => (
                    <div key={item.id} className="flex justify-between items-start pb-4 border-b">
                      <div>
                        <div className="font-medium text-sm pr-4">{item.qty}x {item.name}</div>
                        <div className="text-muted-foreground text-sm">${((Number(item.cost_per_serving || 0) * 3) * item.qty).toFixed(2)}</div>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t space-y-3">
                  <div className="flex justify-between text-muted-foreground text-sm">
                    <span>Subtotal</span>
                    <span>${cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-sm">
                    <span>Taxes & Fees</span>
                    <span>${(cartTotal * 0.08).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Total</span>
                    <span>${(cartTotal * 1.08).toFixed(2)}</span>
                  </div>
                  <Button className="w-full mt-4 text-lg py-6 gap-2">
                    Checkout <ArrowRight className="h-5 w-5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
