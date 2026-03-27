import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Building2, Store, MapPin, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async () => {
    if (!user) {
      toast.error('You must be logged in to complete onboarding');
      return;
    }
    
    setLoading(true);
    try {
      // Validate inputs before calling RPC
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
      
      // Force refresh of the user profile and trigger SaaS redirection logic in App.jsx
      await refreshProfile();
      
      // Minor delay to ensure state propagates before navigation
      setTimeout(() => navigate('/'), 500);
    } catch (error) {
      console.error('Onboarding failed:', error);
      // Handle Postgres unique constraint violation for slug
      const message = error.message?.includes('organizations_slug_key') 
        ? 'This organization slug is already taken. Please try a different one.' 
        : (error.message || 'Failed to complete onboarding');
      
      toast.error(message, {
        duration: 5000,
      });
      setLoading(false); // Ensure loading is reset on error to allow retry
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-50 via-slate-50 to-white">
      <div className="w-full max-w-2xl">
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
                onClick={handleSubmit} 
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
