-- Plans now bill by location. price_monthly is the monthly unit price for one billable location.
COMMENT ON COLUMN public.plans.price_monthly IS 'Monthly unit price in USD for one billable location. Organization subscription totals are price_monthly multiplied by billable location count.';
