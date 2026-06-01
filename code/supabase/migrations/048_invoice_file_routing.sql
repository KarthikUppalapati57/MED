-- Add file_routing_preference to vendors
ALTER TABLE public.vendors 
ADD COLUMN IF NOT EXISTS file_routing_preference TEXT DEFAULT 'storage' CHECK (file_routing_preference IN ('storage', 'payments'));

-- Add file_destination to invoices
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS file_destination TEXT DEFAULT 'storage' CHECK (file_destination IN ('storage', 'payments'));

-- Add comment
COMMENT ON COLUMN public.vendors.file_routing_preference IS 'Default destination for files related to this vendor (storage or payments)';
COMMENT ON COLUMN public.invoices.file_destination IS 'Current destination tag for the invoice file';
