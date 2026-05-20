import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Building2, Store, MapPin, CheckCircle2, ArrowRight, Loader2, Upload, FileSpreadsheet, Plus, Trash2, Sparkles, Check } from 'lucide-react';
import Papa from 'papaparse';

export default function OnboardingPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // ── All hooks MUST be called before any conditional returns (React rules of hooks) ──
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState(null); // 'manual' or 'csv'
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      const { data } = await supabase.from('plans').select('*').eq('is_active', true).order('price_monthly', { ascending: true });
      if (data) setPlans(data);
    };
    fetchPlans();
  }, []);

  // Organization (single)
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [orgSlugManual, setOrgSlugManual] = useState(false);

  // Brands — array of { name, locations: [{ name, address }] }
  const [brands, setBrands] = useState([
    { name: '', locations: [{ name: '', address: '' }] }
  ]);

  const retryCountRef = useRef(0);

  // ── After onboarding completes, poll refreshProfile until org_id is confirmed, then redirect ──
  useEffect(() => {
    if (!completed) return;
    let cancelled = false;

    const pollUntilReady = async () => {
      const MAX_RETRIES = 12; // Increased retries
      let success = false;

      for (let i = 0; i < MAX_RETRIES; i++) {
        if (cancelled) return;
        
        try {
          const freshProfile = await refreshProfile();
          if (freshProfile?.organization_id) {
            success = true;
            break;
          }
        } catch (e) {
          console.warn('Profile refresh attempt failed:', e);
        }
        
        await new Promise(r => setTimeout(r, 800 + (i * 100)));
      }

      if (!cancelled && !success) {
        // Fallback to home anyway
        navigate('/', { replace: true });
      }
    };

    pollUntilReady();
    return () => { cancelled = true; };
  }, [completed, refreshProfile, navigate]);

  // ── If profile org_id becomes available (from polling above), navigate cleanly ──
  useEffect(() => {
    if (completed && userProfile?.organization_id) {
      navigate('/', { replace: true });
    }
  }, [completed, userProfile?.organization_id, navigate]);

  // Guard: If the user already has an organization assigned, they don't need onboarding.
  if (userProfile?.organization_id && !completed) {
    return <Navigate to="/" replace />;
  }

  // Guard: If payment is not verified, they must go back to verification
  if (userProfile && !userProfile.payment_verified && !completed) {
    return <Navigate to="/verify-payment" replace />;
  }

  // ── Success screen while waiting for profile to update ──
  if (completed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-50 via-slate-50 to-white">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <CheckCircle2 className="w-8 h-8 text-teal-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Onboarding Complete!</h2>
          <p className="text-slate-500">Setting up your workspace. Redirecting shortly…</p>
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  const handleOrgNameChange = (value) => {
    setOrgName(value);
    if (!orgSlugManual) {
      setOrgSlug(value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    }
  };

  // Brand helpers
  const addBrand = () => {
    setBrands(prev => [...prev, { name: '', locations: [{ name: '', address: '' }] }]);
  };

  const removeBrand = (idx) => {
    if (brands.length <= 1) return;
    setBrands(prev => prev.filter((_, i) => i !== idx));
  };

  const updateBrandName = (idx, name) => {
    setBrands(prev => prev.map((b, i) => i === idx ? { ...b, name } : b));
  };

  // Location helpers
  const addLocation = (brandIdx) => {
    setBrands(prev => prev.map((b, i) =>
      i === brandIdx ? { ...b, locations: [...b.locations, { name: '', address: '' }] } : b
    ));
  };

  const removeLocation = (brandIdx, locIdx) => {
    setBrands(prev => prev.map((b, i) => {
      if (i !== brandIdx) return b;
      if (b.locations.length <= 1) return b;
      return { ...b, locations: b.locations.filter((_, li) => li !== locIdx) };
    }));
  };

  const updateLocation = (brandIdx, locIdx, field, value) => {
    setBrands(prev => prev.map((b, i) => {
      if (i !== brandIdx) return b;
      return {
        ...b,
        locations: b.locations.map((loc, li) =>
          li === locIdx ? { ...loc, [field]: value } : loc
        )
      };
    }));
  };

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  // Validation helpers
  const hasValidBrands = brands.length > 0 && brands[0].name.trim() !== '';
  const hasValidLocations = brands.every(b =>
    b.locations.length > 0 && b.locations[0].name.trim() !== ''
  );

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCsvFile(file);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            setCsvData(results.data);
            toast.success(`Found ${results.data.length} records in CSV`);
          } else {
            toast.error('The CSV file appears to be empty or formatting is invalid.');
            setCsvFile(null);
          }
        },
        error: (err) => {
          console.error(err);
          toast.error('Failed to parse CSV file.');
          setCsvFile(null);
        }
      });
    }
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Organization Name,Brand Name,Location Name,Location Address\nAcme Corp,Acme Burgers,Downtown Branch,123 Main St NY";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "mevs_onboarding_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const performOnboarding = async (finalOrgName, finalOrgSlug, finalBrands) => {
    if (!user) {
      toast.error('You must be logged in to complete onboarding');
      return;
    }

    setLoading(true);
    try {
      if (!finalOrgName || !finalOrgSlug || finalBrands.length === 0) {
        throw new Error('Please fill in all required fields');
      }

      // Step 1: Create org + first brand + first location via the atomic RPC
      const firstBrand = finalBrands[0];
      const firstLocation = firstBrand.locations[0];

      if (!firstBrand || !firstLocation) {
         throw new Error('You need at least one brand and one location');
      }

      const result = await api.onboarding.setupOrgAndFirstLocation(
        user.id,
        { name: finalOrgName, slug: finalOrgSlug },
        firstBrand.name,
        { name: firstLocation.name, address: firstLocation.address }
      );

      const orgId = result.org.id;
      const firstBrandId = result.brand.id;

      // Step 2: Create additional locations for the first brand
      if (firstBrand.locations.length > 1) {
        const extraLocations = firstBrand.locations.slice(1)
          .filter(loc => loc.name.trim())
          .map(loc => ({
            organization_id: orgId,
            brand_id: firstBrandId,
            name: loc.name.trim(),
            address: loc.address.trim() || 'Address pending',
          }));

        if (extraLocations.length > 0) {
          const { error } = await supabase.from('locations').insert(extraLocations);
          if (error) console.warn('Extra locations insert warning:', error.message);
        }
      }

      // Step 3: Create additional brands (each with their own locations)
      for (let i = 1; i < finalBrands.length; i++) {
        const brand = finalBrands[i];
        if (!brand.name.trim()) continue;

        const { data: newBrand, error: brandErr } = await supabase
          .from('brands')
          .insert({ organization_id: orgId, name: brand.name.trim() })
          .select()
          .single();

        if (brandErr) {
          console.warn(`Brand "${brand.name}" creation warning:`, brandErr.message);
          continue;
        }

        const locs = brand.locations
          .filter(loc => loc.name.trim())
          .map(loc => ({
            organization_id: orgId,
            brand_id: newBrand.id,
            name: loc.name.trim(),
            address: loc.address.trim() || 'Address pending',
          }));

        if (locs.length > 0) {
          const { error: locErr } = await supabase.from('locations').insert(locs);
          if (locErr) console.warn('Locations insert warning:', locErr.message);
        }
      }

      // Step 4: Apply modules and permissions from invitation
      try {
        const { data: invs } = await supabase
          .from('invitations')
          .select('metadata')
          .eq('email', user.email)
          .not('accepted_at', 'is', null)
          .order('accepted_at', { ascending: false })
          .limit(1);

        if (invs && invs[0]) {
          const meta = invs[0].metadata || {};
          
          if (meta.modules) {
            await supabase
              .from('organizations')
              .update({ enabled_modules: meta.modules })
              .eq('id', orgId);
          }

          if (meta.access) {
            const access = meta.access;
            const level = (access.update || access.write) ? 'full' : (access.read ? 'read' : 'none');
            
            const allPages = ['Dashboard', 'Inventory', 'Products', 'Recipes', 'Invoices', 'Payments', 'Vendors', 'AutoOrdering', 'UserManagement', 'AuditLogs'];
            const perms = {};
            allPages.forEach(p => perms[p] = level);

            await supabase
              .from('profiles')
              .update({ 
                permissions: perms,
                access_level: level 
              })
              .eq('id', user.id);
          }
        }
      } catch (err) {
        console.warn('Failed to apply invitation metadata:', err);
      }

      const totalBrands = finalBrands.filter(b => b.name.trim()).length;
      const totalLocations = finalBrands.reduce((sum, b) => sum + b.locations.filter(l => l.name.trim()).length, 0);
      toast.success(`Organization created! Proceed to select a plan.`);
      
      // Refresh profile to get the organization_id in context
      await refreshProfile();
      
      // Move to plan selection step
      setStep(4);
    } catch (error) {
      console.error('Onboarding failed:', error);
      const message = error.message?.includes('organizations_slug_key')
        ? 'This organization slug is already taken. Please try a different one.'
        : (error.message || 'Failed to complete onboarding');
      toast.error(message, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!orgName || !orgSlug || !hasValidBrands || !hasValidLocations) {
      toast.error('Please fill in all required fields');
      return;
    }
    await performOnboarding(orgName, orgSlug, brands);
  };

  const handleCsvSubmit = async () => {
    if (!csvData || csvData.length === 0) {
      toast.error('Please upload a valid CSV file first');
      return;
    }

    let currentOrg = '';
    let currentBrand = '';
    const processedRows = [];

    for (const row of csvData) {
      // Flexibly match column headers (exact match or common variations)
      let oName = (row['Organization Name'] || row['organization_name'] || row['orgName'] || row['Org Name'] || row['org'] || '').trim();
      let bName = (row['Brand Name'] || row['brand_name'] || row['brandName'] || row['Brand'] || row['brand'] || '').trim();
      let lName = (row['Location Name'] || row['location_name'] || row['locationName'] || row['Location'] || row['location'] || '').trim();
      let lAddr = (row['Location Address'] || row['address'] || row['locationAddress'] || row['Address'] || '').trim();

      // Update current tracking variables ONLY when an explicit name is given
      if (oName) currentOrg = oName;
      if (bName) currentBrand = bName;

      // Carry forward from previous rows when cells are blank
      if (!oName) oName = currentOrg;
      if (!bName) bName = currentBrand;

      // A row is valid if we have at least a location name (org/brand inherited is fine)
      if (oName && bName && lName) {
        processedRows.push({
          oName,
          bName,
          lName,
          lAddr: lAddr || 'Address pending'
        });
      }
    }

    if (processedRows.length === 0) {
      toast.error('No valid rows found. Please ensure your CSV has Organization Name, Brand Name, and Location Name columns.');
      return;
    }

    // Use the first org name as the primary organization for onboarding.
    // During onboarding we can only create ONE org — aggregate ALL rows
    // (even if they list different org names) under this single org.
    const finalOrgName = processedRows[0].oName;
    const finalOrgSlug = finalOrgName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);

    // Group ALL rows by brand name (regardless of org column value)
    // This ensures brands/locations from rows with different org names aren't dropped
    const brandsMap = {};
    processedRows.forEach(row => {
      if (!brandsMap[row.bName]) {
        brandsMap[row.bName] = { name: row.bName, locations: [] };
      }
      // Deduplicate locations with same name under the same brand
      const existingLoc = brandsMap[row.bName].locations.find(
        l => l.name.toLowerCase() === row.lName.toLowerCase()
      );
      if (!existingLoc) {
        brandsMap[row.bName].locations.push({ name: row.lName, address: row.lAddr });
      }
    });

    const parsedBrands = Object.values(brandsMap);

    if (parsedBrands.length === 0) {
      toast.error('Could not parse any brands from the CSV. Check your column headers.');
      return;
    }

    toast.info(`Importing ${parsedBrands.length} brand(s) with ${parsedBrands.reduce((s, b) => s + b.locations.length, 0)} location(s)`);
    await performOnboarding(finalOrgName, finalOrgSlug, parsedBrands);
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) {
      toast.error('Please select a plan to continue');
      return;
    }
    
    // If it's a free plan or no Stripe Price ID, we can just complete onboarding
    if (!selectedPlan.stripe_price_id) {
      toast.success('Free plan selected!');
      setCompleted(true);
      return;
    }

    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { 
          priceId: selectedPlan.stripe_price_id,
          successUrl: `${window.location.origin}/`,
          cancelUrl: `${window.location.origin}/onboarding`
        }
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error(err.message || 'Failed to start checkout process');
      setCheckoutLoading(false);
    }
  };

  // Render initial selection screen
  if (!onboardingMode) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-50 via-slate-50 to-white">
        <div className="w-full max-w-2xl">
          <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-xl ring-1 ring-slate-200/50">
            <CardHeader className="text-center pb-8 border-b">
              <CardTitle className="text-3xl font-bold text-slate-900">Welcome to EdgeOps</CardTitle>
              <CardDescription className="text-slate-500 text-lg mt-2">
                How would you like to set up your primary organization?
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8">
              <div 
                onClick={() => setOnboardingMode('manual')}
                className="group cursor-pointer rounded-xl border-2 border-slate-100 p-6 hover:border-teal-600 hover:bg-teal-50/50 transition-all text-center flex flex-col items-center gap-4"
              >
                <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Building2 className="w-8 h-8 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">Manual Setup</h3>
                  <p className="text-sm text-slate-500">I want to type in my organization, brand, and location details directly.</p>
                </div>
              </div>
              
              <div 
                onClick={() => setOnboardingMode('csv')}
                className="group cursor-pointer rounded-xl border-2 border-slate-100 p-6 hover:border-teal-600 hover:bg-teal-50/50 transition-all text-center flex flex-col items-center gap-4"
              >
                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-8 h-8 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">Bulk Import</h3>
                  <p className="text-sm text-slate-500">I have a CSV/Excel file with my organization data ready to upload.</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <p className="text-center mt-8 text-slate-400 text-sm">
            Logged in as <span className="text-teal-600 font-medium">{user?.email}</span>
          </p>
        </div>
      </div>
    );
  }

  // Render CSV Mode
  if (onboardingMode === 'csv') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-50 via-slate-50 to-white">
        <div className="w-full max-w-2xl">
          <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-xl ring-1 ring-slate-200/50">
            <CardHeader className="space-y-1 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-6 h-6 text-indigo-600" /> Bulk Import
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setOnboardingMode(null)}>Change Method</Button>
              </div>
              <CardDescription className="text-slate-500 text-base">
                Upload a CSV file containing your organization details. We will set up the first valid row as your primary organization. 
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="p-4 bg-indigo-50 text-indigo-700 text-sm rounded-lg border border-indigo-100">
                <p className="font-semibold mb-1">Required CSV Columns:</p>
                <code className="bg-white px-2 py-1 object-cover rounded text-xs select-all text-slate-600">Organization Name, Brand Name, Location Name, Location Address</code>
              </div>
              
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 hover:border-indigo-500 hover:bg-slate-50 transition-colors">
                <input 
                  type="file" 
                  id="csv-upload" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={handleCsvUpload} 
                />
                <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center gap-4">
                  <div className="w-12 h-12 bg-white shadow-sm rounded-full flex items-center justify-center text-indigo-600">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <span className="text-indigo-600 font-semibold hover:underline">Click to browse</span> or drag and drop
                    <p className="text-xs text-slate-400 mt-1">.CSV files only</p>
                  </div>
                </label>
              </div>

              {csvFile && (
                <div className="p-3 bg-white border rounded-lg flex items-center justify-between shadow-sm">
                  <span className="text-sm font-medium text-slate-700 truncate">{csvFile.name}</span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{csvData.length} Valid Rows</span>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between pt-6 border-t border-slate-100">
              <Button variant="outline" onClick={downloadTemplate}>
                Download Template
              </Button>
              <Button 
                onClick={handleCsvSubmit} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[140px]"
                disabled={loading || !csvFile || csvData.length === 0}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                ) : (
                  <>Import & Complete <CheckCircle2 className="w-4 h-4 ml-2" /> </>
                )}
              </Button>
            </CardFooter>
          </Card>
          <p className="text-center mt-8 text-slate-400 text-sm">
            Logged in as <span className="text-indigo-600 font-medium">{user?.email}</span>
          </p>
        </div>
      </div>
    );
  }

  // Render Manual Mode
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-50 via-slate-50 to-white">
      <div className="w-full max-w-2xl">
        <div className="flex justify-between mb-2">
          <Button variant="ghost" size="sm" onClick={() => setOnboardingMode(null)} className="text-slate-500 hover:text-slate-800">
            ← Back to options
          </Button>
        </div>
        {/* Progress Bar */}
        <div className="flex items-center justify-between mb-8 px-2">
          {[1, 2, 3, 4].map((i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  step >= i ? 'bg-teal-600 border-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-white border-slate-200 text-slate-400'
                }`}>
                  {step > i ? <CheckCircle2 className="w-6 h-6" /> : i}
                </div>
                <span className={`text-xs font-medium ${step >= i ? 'text-teal-700' : 'text-slate-400'}`}>
                  {i === 1 ? 'Organization' : i === 2 ? 'Brands' : i === 3 ? 'Locations' : 'Plan'}
                </span>
              </div>
              {i < 4 && (
                <div className={`flex-1 h-0.5 mx-4 transition-all duration-500 ${step > i ? 'bg-teal-600' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-xl ring-1 ring-slate-200/50">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {step === 1 && <><Building2 className="w-6 h-6 text-teal-600" /> Let's start with your company</>}
              {step === 2 && <><Store className="w-6 h-6 text-teal-600" /> Define your brands</>}
              {step === 3 && <><MapPin className="w-6 h-6 text-teal-600" /> Add locations</>}
              {step === 4 && <><Sparkles className="w-6 h-6 text-teal-600" /> Select a Plan</>}
            </CardTitle>
            <CardDescription className="text-slate-500 text-base">
              {step === 1 && "What's the name of your overall business entity?"}
              {step === 2 && "Add all your restaurant brands. You need at least one."}
              {step === 3 && "Add locations for each brand. Each brand needs at least one."}
              {step === 4 && "Choose the subscription tier that best fits your needs."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* ── Step 1: Organization ── */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input 
                    id="orgName" 
                    placeholder="e.g. Acme Hospitality Group" 
                    value={orgName} 
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    className="h-12 text-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgSlug">Slug (URL identifier)</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">edgeops.io/</span>
                    <Input 
                      id="orgSlug" 
                      placeholder="acme-hospitality" 
                      value={orgSlug} 
                      onChange={(e) => {
                        setOrgSlug(e.target.value);
                        setOrgSlugManual(true);
                      }}
                      className="h-10 text-sm italic text-teal-700 font-medium"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Brands ── */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                {brands.map((brand, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                          Brand {idx + 1}
                        </span>
                      </div>
                      <Input 
                        placeholder={idx === 0 ? "e.g. Acme Burgers" : "e.g. Acme Pizza"} 
                        value={brand.name} 
                        onChange={(e) => updateBrandName(idx, e.target.value)}
                        className="h-12 text-lg"
                      />
                    </div>
                    {brands.length > 1 && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 mt-5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeBrand(idx)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  onClick={addBrand}
                  className="w-full border-dashed border-2 border-teal-200 text-teal-600 hover:bg-teal-50 hover:border-teal-400 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Another Brand
                </Button>
              </div>
            )}

            {/* ── Step 3: Locations (grouped by brand) ── */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                {brands.filter(b => b.name.trim()).map((brand, brandIdx) => (
                  <div key={brandIdx} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-teal-500" />
                      <h3 className="text-sm font-bold text-slate-700">{brand.name}</h3>
                      <span className="text-xs text-slate-400">({brand.locations.length} location{brand.locations.length !== 1 ? 's' : ''})</span>
                    </div>

                    <div className="pl-4 border-l-2 border-teal-100 space-y-3">
                      {brand.locations.map((loc, locIdx) => (
                        <div key={locIdx} className="group bg-slate-50 rounded-lg p-3 border border-slate-100 hover:border-teal-200 transition-colors">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 space-y-2">
                              <Input 
                                placeholder={locIdx === 0 ? "e.g. Downtown Branch" : "e.g. Airport Location"} 
                                value={loc.name} 
                                onChange={(e) => updateLocation(brandIdx, locIdx, 'name', e.target.value)}
                                className="h-10 bg-white"
                              />
                              <Input 
                                placeholder="123 Street, City, State, ZIP" 
                                value={loc.address} 
                                onChange={(e) => updateLocation(brandIdx, locIdx, 'address', e.target.value)}
                                className="h-9 bg-white text-sm text-slate-500"
                              />
                            </div>
                            {brand.locations.length > 1 && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => removeLocation(brandIdx, locIdx)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => addLocation(brandIdx)}
                        className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 text-xs w-full border border-dashed border-teal-200"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Location to {brand.name}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Step 4: Plans ── */}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plans.length === 0 ? (
                    <div className="col-span-2 text-center py-8 text-slate-500">
                      Loading plans...
                    </div>
                  ) : (
                    plans.map((plan) => (
                      <div 
                        key={plan.id}
                        onClick={() => setSelectedPlan(plan)}
                        className={`cursor-pointer rounded-xl border-2 p-6 transition-all duration-200 ${
                          selectedPlan?.id === plan.id 
                            ? 'border-teal-600 bg-teal-50/30 shadow-md ring-1 ring-teal-600' 
                            : 'border-slate-200 hover:border-teal-300 bg-white hover:shadow-sm'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-bold text-lg text-slate-900">{plan.name}</h3>
                            <p className="text-sm text-slate-500 line-clamp-2">{plan.description}</p>
                          </div>
                          {selectedPlan?.id === plan.id && (
                            <div className="bg-teal-600 text-white p-1 rounded-full shrink-0 animate-in zoom-in-50">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                        <div className="mb-4">
                          <span className="text-3xl font-extrabold text-slate-900">${plan.price_monthly}</span>
                          <span className="text-sm font-medium text-slate-500">/mo</span>
                        </div>
                        <ul className="space-y-2 text-sm text-slate-600">
                          {plan.features?.slice(0, 4).map((feat, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-teal-500 shrink-0" />
                              <span className="truncate">{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between pt-6 border-t border-slate-100">
            {step > 1 && step < 4 ? (
              <Button variant="ghost" onClick={prevStep} disabled={loading}>
                Back
              </Button>
            ) : (
              <div />
            )}
            
            {step < 3 ? (
              <Button 
                onClick={nextStep} 
                className="bg-teal-600 hover:bg-teal-700 text-white min-w-[120px]"
                disabled={
                  (step === 1 && !orgName) || 
                  (step === 2 && !hasValidBrands)
                }
              >
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : step === 3 ? (
              <Button 
                onClick={handleManualSubmit} 
                className="bg-teal-600 hover:bg-teal-700 text-white min-w-[140px]"
                disabled={loading || !hasValidLocations}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  <>Next Step <ArrowRight className="w-4 h-4 ml-2" /> </>
                )}
              </Button>
            ) : (
              <Button 
                onClick={handleSubscribe} 
                className="bg-teal-600 hover:bg-teal-700 text-white min-w-[140px]"
                disabled={checkoutLoading || !selectedPlan}
              >
                {checkoutLoading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing Checkout...</>
                ) : (
                  <>Complete & Subscribe <CheckCircle2 className="w-4 h-4 ml-2" /> </>
                )}
              </Button>
            )}
          </CardFooter>
        </Card>

        <p className="text-center mt-8 text-slate-400 text-sm">
          Logged in as <span className="text-teal-600 font-medium">{user?.email}</span>
        </p>
      </div>
    </div>
  );
}
