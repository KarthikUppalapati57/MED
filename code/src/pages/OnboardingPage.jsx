import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Building2, Store, MapPin, CheckCircle2, ArrowRight, Loader2, Upload, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState(null); // 'manual' or 'csv'
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);

  const [formData, setFormData] = useState({
    orgName: '',
    orgSlug: '',
    brandName: '',
    locationName: '',
    address: '',
    orgSlugManual: false,
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newData = { ...prev, [name]: value };
      // Auto-generate slug from org name if slug hasn't been manually edited
      if (name === 'orgName' && !prev.orgSlugManual) {
        newData.orgSlug = value.toLowerCase().replace(/[^a-z0-9]/g, '-');
      }
      return newData;
    });
  };

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

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

  const handleManualSubmit = async () => {
    if (!user) {
      toast.error('You must be logged in to complete onboarding');
      return;
    }
    
    setLoading(true);
    try {
      if (!formData.orgName || !formData.orgSlug || !formData.brandName || !formData.locationName) {
        throw new Error('Please fill in all required fields');
      }

      await api.onboarding.setupOrgAndFirstLocation(
        user.id,
        { name: formData.orgName, slug: formData.orgSlug },
        formData.brandName,
        { name: formData.locationName, address: formData.address }
      );

      toast.success('Onboarding complete! Welcome to the platform.');
      await refreshProfile();
      setTimeout(() => navigate('/'), 500);
    } catch (error) {
      console.error('Onboarding failed:', error);
      const message = error.message?.includes('organizations_slug_key') 
        ? 'This organization slug is already taken. Please try a different one.' 
        : (error.message || 'Failed to complete onboarding');
      toast.error(message, { duration: 5000 });
      setLoading(false);
    }
  };

  const handleCsvSubmit = async () => {
    if (!user) {
      toast.error('You must be logged in to complete onboarding');
      return;
    }
    
    if (csvData.length === 0) {
      toast.error('Please upload a valid CSV file first');
      return;
    }

    setLoading(true);
    try {
      for (const row of csvData) {
        const orgName = row['Organization Name'] || row.orgName || row.organization_name;
        const brandName = row['Brand Name'] || row.brandName || row.brand_name;
        const locationName = row['Location Name'] || row.locationName || row.location_name;
        const locationAddress = row['Location Address'] || row.locationAddress || row.address || 'Address pending';

        if (!orgName || !brandName || !locationName) {
          console.warn('Skipping invalid row:', row);
          continue;
        }

        const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);

        try {
          await api.onboarding.setupOrgAndFirstLocation(
            user.id,
            { name: orgName, slug: orgSlug },
            brandName,
            { name: locationName, address: locationAddress }
          );
        } catch (rowErr) {
          console.error(`Failed to create org ${orgName}:`, rowErr);
          // If first row throws because they already have an org, continue might fail. 
          // The RPC prevents taking ownership if they already belong to an org!
          // We rely on the first successful one binding them to the platform.
          // Wait, the RPC `setup_organization_full` throws if user already belongs to an org.
          // So bulk uploading multiple orgs assigned to the SAME owner using this RPC will fail on the SECOND entity!
          throw new Error(`Cannot bulk create disconnected primary organizations for a single owner via onboarding. An owner can only have one primary organization initially.`);
        }
      }

      toast.success('Bulk Onboarding complete! Additional entities can be linked from your dashboard.');
      await refreshProfile();
      setTimeout(() => navigate('/'), 500);
    } catch (error) {
      console.error('CSV Onboarding failed:', error);
      toast.error(error.message || 'Failed to complete bulk onboarding', { duration: 5000 });
      setLoading(false);
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
          {[1, 2, 3].map((i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  step >= i ? 'bg-teal-600 border-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-white border-slate-200 text-slate-400'
                }`}>
                  {step > i ? <CheckCircle2 className="w-6 h-6" /> : i}
                </div>
                <span className={`text-xs font-medium ${step >= i ? 'text-teal-700' : 'text-slate-400'}`}>
                  {i === 1 ? 'Organization' : i === 2 ? 'Brand' : 'Location'}
                </span>
              </div>
              {i < 3 && (
                <div className={`flex-1 h-0.5 mx-4 transition-all duration-500 ${step > i ? 'bg-teal-600' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-xl ring-1 ring-slate-200/50">
          <CardHeader className="space-y-1 pb-8">
            <CardTitle className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {step === 1 && <><Building2 className="w-6 h-6 text-teal-600" /> Let's start with your company</>}
              {step === 2 && <><Store className="w-6 h-6 text-teal-600" /> Define your brand</>}
              {step === 3 && <><MapPin className="w-6 h-6 text-teal-600" /> Your first location</>}
            </CardTitle>
            <CardDescription className="text-slate-500 text-base">
              {step === 1 && "What's the name of your overall business entity?"}
              {step === 2 && "Brands represent your restaurant concepts within the organization."}
              {step === 3 && "Where is your physical store or kitchen located?"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input 
                    id="orgName" 
                    name="orgName" 
                    placeholder="e.g. Acme Hospitality Group" 
                    value={formData.orgName} 
                    onChange={handleInputChange}
                    className="h-12 text-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgSlug">Slug (URL identifier)</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">edgeops.io/</span>
                    <Input 
                      id="orgSlug" 
                      name="orgSlug" 
                      placeholder="acme-hospitality" 
                      value={formData.orgSlug} 
                      onChange={(e) => {
                        handleInputChange(e);
                        setFormData(prev => ({ ...prev, orgSlugManual: true }));
                      }}
                      className="h-10 text-sm italic text-teal-700 font-medium"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-2">
                  <Label htmlFor="brandName">Brand Name</Label>
                  <Input 
                    id="brandName" 
                    name="brandName" 
                    placeholder="e.g. Acme Burgers" 
                    value={formData.brandName} 
                    onChange={handleInputChange}
                    className="h-12 text-lg"
                  />
                  <p className="text-xs text-slate-400">You can add more brands later in your settings.</p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-2">
                  <Label htmlFor="locationName">Branch/Location Name</Label>
                  <Input 
                    id="locationName" 
                    name="locationName" 
                    placeholder="e.g. Downtown Branch" 
                    value={formData.locationName} 
                    onChange={handleInputChange}
                    className="h-12 text-lg"
                  />
                  <p className="text-xs text-slate-400">You can add more locations later in your dashboard.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Full Address</Label>
                  <Input 
                    id="address" 
                    name="address" 
                    placeholder="123 Street, City, State, ZIP" 
                    value={formData.address} 
                    onChange={handleInputChange}
                    className="h-12"
                  />
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between pt-6 border-t border-slate-100">
            {step > 1 ? (
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
                  (step === 1 && !formData.orgName) || 
                  (step === 2 && !formData.brandName)
                }
              >
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={handleManualSubmit} 
                className="bg-teal-600 hover:bg-teal-700 text-white min-w-[140px]"
                disabled={loading || !formData.locationName}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Setting up...</>
                ) : (
                  <>Complete Setup <CheckCircle2 className="w-4 h-4 ml-2" /> </>
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
