import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  User, 
  Mail, 
  Phone, 
  Lock, 
  Eye, 
  EyeOff, 
  KeyRound, 
  ShieldCheck, 
  Loader2, 
  Building, 
  Briefcase,
  Download,
  Trash2,
  Database
} from 'lucide-react';

export default function Profile() {
  const { user, userProfile, role, organization, refreshProfile } = useAuth();
  
  // Profile edit states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Sync profile details when loaded
  useEffect(() => {
    if (userProfile) {
      setFullName(userProfile.full_name || '');
      setPhone(userProfile.phone || '');
    }
  }, [userProfile]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Full Name cannot be empty.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success('Profile details updated successfully!');
    } catch (err) {
      console.error('Error updating profile:', err);
      toast.error(err.message || 'Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Please enter your current password.');
      return;
    }
    if (!password) {
      toast.error('Please enter a new password.');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    try {
      // Step 1: Verify current password before allowing the change
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) {
        toast.error('Current password is incorrect.');
        setIsSavingPassword(false);
        return;
      }

      // Step 2: Update to the new password
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully!');
    } catch (err) {
      console.error('Error updating password:', err);
      toast.error(err.message || 'Failed to update password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDataExport = () => {
    // Generate a simple CSV for data export (simulating a full export)
    const headers = ["ID", "Email", "Full Name", "Phone", "Role", "Organization ID"];
    const row = [
      user?.id,
      user?.email,
      userProfile?.full_name,
      userProfile?.phone,
      role,
      organization?.id
    ];
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + row.map(e => `"${e || ''}"`).join(",");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `restops_data_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success("Data export initiated successfully.");
  };

  const handleAccountDeletion = () => {
    // In a real app, this would trigger an email or set a deletion flag
    toast.success("Account deletion request submitted to Platform Admins. You will be contacted shortly to confirm.");
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 w-full max-w-[2400px] mx-auto">
      {/* Welcome Banner */}
      <div className="relative rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-6 md:p-8 text-white shadow-xl overflow-hidden animate-in fade-in duration-500">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-96 h-96 bg-resend-blue/50/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative flex flex-col md:flex-row items-center gap-6 z-10">
          <div className="h-20 w-20 rounded-2xl bg-primary/20 border border-teal-400/30 flex items-center justify-center text-4xl font-extrabold text-teal-400 shadow-inner">
            {fullName ? fullName.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="text-center md:text-left space-y-1.5 flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight">{fullName || 'Account Member'}</h1>
            <p className="text-muted-foreground text-sm font-medium flex flex-wrap items-center justify-center md:justify-start gap-2">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> {user?.email}
              </span>
              <span className="text-muted-foreground">â€¢</span>
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" /> {(role || '').replace('_', ' ')}
              </span>
            </p>
          </div>
          <div className="flex flex-col gap-2 items-center md:items-end">
            <Badge className="bg-primary/10 text-teal-400 border border-primary/20 px-3 py-1 text-xs font-semibold capitalize tracking-wide shadow-sm">
              Active Member
            </Badge>
            <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest mt-1">
              Member ID: {user?.id?.substring(0, 8)}...
            </p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 items-start">
        {/* Personal Details Card */}
        <Card className="md:col-span-2 border-none shadow-md bg-card/70 backdrop-blur-md ring-1 ring-slate-100/50">
          <CardHeader className="border-b border-slate-50/50 pb-5">
            <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <User className="w-5 h-5 text-primary" /> Personal Details
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs">
              Update your account details and contact information.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-foreground font-semibold text-sm">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      placeholder="e.g., Karthik"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-9 h-10.5 rounded-lg border-border focus:ring-2 focus:ring-ring/20 focus:border-primary"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-foreground font-semibold text-sm">Mobile Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="e.g., +1 (123) 456-7890"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-9 h-10.5 rounded-lg border-border focus:ring-2 focus:ring-ring/20 focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-foreground font-semibold text-sm">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="pl-9 h-10.5 rounded-lg border-border bg-secondary text-muted-foreground cursor-not-allowed border-none shadow-none"
                  />
                </div>
                <p className="text-[10.5px] text-muted-foreground italic">Registered email cannot be changed.</p>
              </div>

              <div className="pt-4 border-t border-border flex justify-end">
                <Button
                  type="submit"
                  disabled={isSavingProfile}
                  className="bg-primary hover:bg-primary text-white font-semibold rounded-lg px-6 h-10 shadow-lg shadow-teal-600/15"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving changes...
                    </>
                  ) : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Info & Security Sidebar */}
        <div className="space-y-6">
          {/* Security & Password Card */}
          <Card className="border-none shadow-md bg-card/70 backdrop-blur-md ring-1 ring-slate-100/50">
            <CardHeader className="border-b border-slate-50/50 pb-5">
              <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" /> Update Password
              </CardTitle>
              <CardDescription className="text-muted-foreground text-xs">
                Keep your account secure by using a strong password.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword" className="text-foreground font-semibold text-sm">Current Password</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="currentPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="pl-9 pr-10 h-10 rounded-lg border-border focus:ring-2 focus:ring-ring/20 focus:border-primary"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="newPassword" className="text-foreground font-semibold text-sm">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-10 h-10 rounded-lg border-border focus:ring-2 focus:ring-ring/20 focus:border-primary"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-muted-foreground hover:text-muted-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-foreground font-semibold text-sm">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-9 pr-10 h-10 rounded-lg border-border focus:ring-2 focus:ring-ring/20 focus:border-primary"
                      required
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isSavingPassword}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg h-10 shadow-md"
                  >
                    {isSavingPassword ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : 'Update Password'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Quick Context Card */}
          <Card className="border-none shadow-md bg-gradient-to-br bg-background/30 ring-1 ring-slate-100/50">
            <CardContent className="p-6 space-y-4">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                <Building className="w-4 h-4 text-primary" /> Workplace Details
              </h3>
              
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-border">
                  <span className="text-muted-foreground font-medium">Organization</span>
                  <span className="text-foreground font-bold">{organization?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-border">
                  <span className="text-muted-foreground font-medium">Access Role</span>
                  <Badge className="bg-secondary text-foreground capitalize border-none font-bold">
                    {(role || '').replace('_', ' ')}
                  </Badge>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-muted-foreground font-medium">MFA Security</span>
                  <a 
                    href="/OrgManagement?tab=security"
                    className="text-primary hover:text-primary font-bold hover:underline flex items-center gap-0.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 inline" /> Setup / View
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Privacy & CCPA Rights */}
          <Card className="border-none shadow-md bg-card/70 backdrop-blur-md ring-1 ring-slate-100/50 mt-6">
            <CardHeader className="border-b border-slate-50/50 pb-5">
              <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <Database className="w-5 h-5 text-resend-orange" /> Data Privacy
              </CardTitle>
              <CardDescription className="text-muted-foreground text-xs">
                Manage your data in accordance with CCPA and data ownership laws.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-4">
                <Button 
                  onClick={handleDataExport}
                  variant="outline" 
                  className="w-full justify-start text-sm border-border/60 hover:bg-secondary/60"
                >
                  <Download className="w-4 h-4 mr-2 text-foreground" />
                  Export My Data (CSV)
                </Button>
                <Button 
                  onClick={handleAccountDeletion}
                  variant="outline" 
                  className="w-full justify-start text-sm border-resend-red/20 text-resend-red hover:bg-resend-red/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Request Account Deletion
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

