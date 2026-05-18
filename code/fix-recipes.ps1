$file = Join-Path $PSScriptRoot "src\pages\Recipes.jsx"
$content = [System.IO.File]::ReadAllText($file)
$old = "import { useAuthQuery } from '@/hooks/useAuthQuery';"
$new = "import { useAuthQuery } from '@/hooks/useAuthQuery';`r`nimport { supabase } from '@/lib/supabaseClient';"
$content = $content.Replace($old, $new)

# Add realtime subscription after products query
$old2 = "  const { data: products = [] } = useAuthQuery({`r`n    queryKey: ['products'],`r`n    queryFn: () => api.entities.Product.list(),`r`n  });`r`n`r`n  const createMutation"
$new2 = @"
  const { data: products = [] } = useAuthQuery({
    queryKey: ['products'],
    queryFn: () => api.entities.Product.list(),
  });

  // ── Realtime subscription ──────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel('recipes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['recipes'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const createMutation
"@
$content = $content.Replace($old2, $new2)

[System.IO.File]::WriteAllText($file, $content)
Write-Host "Recipes.jsx updated successfully"
