-- Align product category type labels with MarginEdge-style reporting.
-- This intentionally separates category type from accounting/COA labels.

CREATE OR REPLACE FUNCTION public.derive_product_category_type(
  p_accounting_category text,
  p_category text DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      lower(COALESCE(p_accounting_category, '')) AS accounting,
      lower(COALESCE(p_category, '')) AS category,
      lower(COALESCE(p_name, '')) AS name
  ),
  combined AS (
    SELECT accounting, category, name, accounting || ' ' || category || ' ' || name AS text
    FROM normalized
  )
  SELECT CASE
    WHEN text ~ '(beer|ale|lager|ipa|stout|porter|pilsner|cider|seltzer|blue moon|modelo|corona|budweiser|bud light|coors|miller|heineken)'
      THEN 'Beer'
    WHEN text ~ '(wine|pinot|chardonnay|cabernet|merlot|sauvignon|riesling|prosecco|champagne|moscato|malbec|zinfandel|rose\b)'
      THEN 'Wine'
    WHEN text ~ '(liquor|spirit|vodka|gin|rum|tequila|whiskey|whisky|bourbon|scotch|brandy|cognac|mezcal|liqueur|triple sec)'
      THEN 'Liquor'
    WHEN text ~ '(n/a bev|na beverage|non[- ]?alcohol|beverage|soda|juice|tea|coffee|lemonade|energy drink|water|syrup, fontn|fountain|bib)'
      OR accounting LIKE '52%'
      OR accounting LIKE '%beverage%'
      THEN 'N/A Bev'
    WHEN text ~ '(retail|merchandise|gift card|giftcard|apparel|shirt|hat|merch)'
      THEN 'Retail'
    WHEN accounting LIKE '51%'
      OR accounting LIKE '%food%'
      OR accounting IN ('food', 'food_cogs', '5100')
      OR category ~ '(dairy|produce|poultry|grocery|meat|seafood|bakery|bread|frozen|dry goods)'
      THEN 'Food'
    ELSE 'Other'
  END
  FROM combined;
$$;

COMMENT ON FUNCTION public.derive_product_category_type(text, text, text)
IS 'Returns MarginEdge-style product category types: Food, Beer, Wine, Liquor, N/A Bev, Retail, Other.';
