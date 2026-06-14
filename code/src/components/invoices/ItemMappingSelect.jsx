import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Check, ChevronsUpDown, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

export default function ItemMappingSelect({ 
  value, 
  onChange, 
  vendorItemName, 
  vendorId, 
  placeholder = "Select product..." 
}) {
  const [open, setOpen] = useState(false);
  const { organization } = useAuth();

  const { data: products = [] } = useQuery({
    queryKey: ['products', organization?.id],
    queryFn: () => api.entities.Product.list(),
    enabled: !!organization?.id,
  });

  const selectedProduct = products.find(p => p.id === value || p.product_id === value);
  const exactMatchProduct = products.find(p => p.name?.toLowerCase() === vendorItemName?.toLowerCase());

  // Auto-select exact match if value is empty
  React.useEffect(() => {
    if (!value && exactMatchProduct) {
      onChange(exactMatchProduct.product_id || exactMatchProduct.id);
    }
  }, [value, exactMatchProduct, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-8 px-2 font-normal",
            !selectedProduct && "text-muted-foreground",
            !selectedProduct && !exactMatchProduct && vendorItemName && "border-resend-yellow bg-resend-yellow/10"
          )}
        >
          <span className="truncate flex-1 text-left">
            {selectedProduct ? selectedProduct.name : exactMatchProduct ? exactMatchProduct.name : placeholder}
          </span>
          {!selectedProduct && !exactMatchProduct && vendorItemName && (
            <AlertCircle className="h-4 w-4 text-resend-yellow ml-2 shrink-0" />
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search catalog..." />
          <CommandList>
            <CommandEmpty>No product found. It will be created.</CommandEmpty>
            <CommandGroup heading="Internal Catalog">
              {products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={product.name}
                  onSelect={() => {
                    onChange(product.product_id || product.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      (value === product.product_id || value === product.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {product.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
