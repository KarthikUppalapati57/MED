import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import { AUDIT_MODULES, logAudit } from '@/lib/audit';
import { notifyManagers } from '@/lib/notificationService';
import { toast } from 'sonner';
import { PASSWORD_POLICY_DESCRIPTION, validatePasswordConfirmation, validatePasswordPolicy } from '@/lib/passwordPolicy';
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
  CheckCircle2,
  Loader2, 
  Building, 
  Briefcase,
  Download,
  Trash2,
  Database
} from 'lucide-react';

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return String(value || '').trim();
}

function isValidPhone(value) {
  return String(value || '').replace(/\D/g, '').length >= 10;
}
export default function Profile() {
  const { user, userProfile, role, organization, refreshProfile } = useAuth();
  
  // Profile edit states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState({ otpId: null, code: '', verifiedTarget: '', sending: false, verifying: false });

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);

  // Sync profile details when loaded
  useEffect(() => {
    if (userProfile) {
      setFullName(userProfile.full_name || '');
      setPhone(userProfile.phone || '');
      setPhoneOtp({ otpId: null, code: '', verifiedTarget: normalizePhone(userProfile.phone || ''), sending: false, verifying: false });
    }
  }, [userProfile]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Full Name cannot be empty.');
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    const originalPhone = normalizePhone(userProfile?.phone || '');
    const phoneChanged = normalizedPhone !== originalPhone;

    if (phoneChanged && normalizedPhone) {
      if (!isValidPhone(normalizedPhone)) {
        toast.error('Enter a valid mobile number before saving.');
        return;
      }
      if (phoneOtp.verifiedTarget !== normalizedPhone) {
        toast.error('Verify the new mobile number with OTP before saving.');
        return;
      }
    }

    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: normalizedPhone,
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

  const handleRequestPhoneOtp = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (!isValidPhone(normalizedPhone)) {
      toast.error('Enter a valid mobile number first.');
      return;
    }
    setPhoneOtp((prev) => ({ ...prev, sending: true, otpId: null, code: '', verifiedTarget: '' }));
    try {
      const result = await api.onboarding.requestContactOtp({ channel: 'phone', target: normalizedPhone });
      setPhoneOtp({ otpId: result.otp_id, code: '', verifiedTarget: '', sending: false, verifying: false });
      toast.success('Phone OTP sent.');
    } catch (err) {
      console.error('Phone OTP request failed:', err);
      toast.error(err.message || 'Failed to send phone OTP.');
      setPhoneOtp((prev) => ({ ...prev, sending: false }));
    }
  };

  const handleVerifyPhoneOtp = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (!phoneOtp.otpId) {
      toast.error('Send an OTP first.');
      return;
    }
    if (!String(phoneOtp.code || '').trim()) {
      toast.error('Enter the 6-digit OTP code.');
      return;
    }
    setPhoneOtp((prev) => ({ ...prev, verifying: true }));
    try {
      await api.onboarding.verifyContactOtp({ channel: 'phone', target: normalizedPhone, code: phoneOtp.code, otpId: phoneOtp.otpId });
      setPhoneOtp({ otpId: phoneOtp.otpId, code: '', verifiedTarget: normalizedPhone, sending: false, verifying: false });
      toast.success('Mobile number verified.');
    } catch (err) {
      console.error('Phone OTP verification failed:', err);
      toast.error(err.message || 'Invalid OTP code.');
      setPhoneOtp((prev) => ({ ...prev, verifying: false }));
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
    const passwordMatch = validatePasswordConfirmation(password, confirmPassword);
    if (!passwordMatch.isValid) {
      toast.error(passwordMatch.message);
      return;
    }
    const passwordPolicy = validatePasswordPolicy(password, {
      email: user?.email,
      fullName: userProfile?.full_name,
      currentPassword,
    });
    if (!passwordPolicy.isValid) {
      toast.error(passwordPolicy.message);
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

  const handleDataExport = async () => {
    if (!user?.id) return;
    setIsExportingData(true);
    try {
      const [notificationsResult, auditResult] = await Promise.all([
        supabase
          .from('notifications')
          .select('id,title,message,type,is_read,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(500),
        organization?.id
          ? supabase
              .from('audit_logs')
              .select('id,action,module,table_name,record_id,created_at')
              .eq('organization_id', organization.id)
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(500)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (notificationsResult.error) throw notificationsResult.error;
      if (auditResult.error) console.warn('Audit events omitted from data export:', auditResult.error.message);

      const exportPayload = {
        exported_at: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email,
          full_name: userProfile?.full_name || null,
          phone: userProfile?.phone || null,
          role,
          organization_id: organization?.id || null,
        },
        organization: organization ? { id: organization.id, name: organization.name } : null,
        notifications: notificationsResult.data || [],
        audit_events: auditResult.error ? [] : (auditResult.data || []),
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `restops_data_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await logAudit({
        action: 'profile_data_export_downloaded',
        entityId: user.id,
        entityType: 'profile_privacy_request',
        module: AUDIT_MODULES.USERS,
        orgId: organization?.id,
        userId: user.id,
        details: { notification_count: exportPayload.notifications.length, audit_event_count: exportPayload.audit_events.length },
      });
      toast.success('Data export downloaded.');
    } catch (err) {
      console.error('Error exporting profile data:', err);
      toast.error(err.message || 'Failed to export data.');
    } finally {
      setIsExportingData(false);
    }
  };

  const handleAccountDeletion = async () => {
    if (!user?.id) return;
    setIsRequestingDeletion(true);
    try {
      await logAudit({
        action: 'account_deletion_requested',
        entityId: user.id,
        entityType: 'profile_privacy_request',
        module: AUDIT_MODULES.USERS,
        orgId: organization?.id,
        userId: user.id,
        details: { email: user.email, role },
      });

      if (organization?.id) {
        await notifyManagers({
          organization_id: organization.id,
          title: 'Account deletion requested',
          message: `${userProfile?.full_name || user.email || 'A user'} requested account deletion from their profile privacy controls.`,
          type: 'system',
          metadata: { source: 'profile_privacy', requested_user_id: user.id },
          exclude_user_id: user.id,
        });
      }

      toast.success('Account deletion request recorded and sent to managers.');
    } catch (err) {
      console.error('Error requesting account deletion:', err);
      toast.error(err.message || 'Failed to submit deletion request.');
    } finally {
      setIsRequestingDeletion(false);
    }
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
              <span className="text-muted-foreground">•</span>
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
                      onChange={(e) => {
                        const nextPhone = e.target.value;
                        setPhone(nextPhone);
                        setPhoneOtp((prev) => ({ ...prev, code: '', otpId: null, verifiedTarget: normalizePhone(nextPhone) === normalizePhone(userProfile?.phone || '') ? normalizePhone(nextPhone) : '' }));
                      }}
                      className="pl-9 h-10.5 rounded-lg border-border focus:ring-2 focus:ring-ring/20 focus:border-primary"
                    />
                  </div>
                  {normalizePhone(phone) !== normalizePhone(userProfile?.phone || '') && normalizePhone(phone) && (
                    <div className="mt-2 space-y-2 rounded-lg border border-border/70 bg-secondary/30 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Verify this mobile number before saving profile changes.</p>
                        <Button type="button" variant={phoneOtp.verifiedTarget === normalizePhone(phone) ? 'secondary' : 'outline'} size="sm" onClick={handleRequestPhoneOtp} disabled={phoneOtp.sending} className="gap-2">
                          {phoneOtp.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : phoneOtp.verifiedTarget === normalizePhone(phone) ? <CheckCircle2 className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                          {phoneOtp.sending ? 'Sending' : phoneOtp.verifiedTarget === normalizePhone(phone) ? 'Verified' : phoneOtp.otpId ? 'Resend OTP' : 'Send OTP'}
                        </Button>
                      </div>
                      {phoneOtp.otpId && phoneOtp.verifiedTarget !== normalizePhone(phone) && (
                        <div className="flex gap-2">
                          <Input value={phoneOtp.code} onChange={(e) => setPhoneOtp((prev) => ({ ...prev, code: e.target.value }))} placeholder="Phone OTP" inputMode="numeric" className="h-9" />
                          <Button type="button" onClick={handleVerifyPhoneOtp} disabled={phoneOtp.verifying} className="shrink-0 h-9">
                            {phoneOtp.verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
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
                  className="bg-primary hover:bg-primary text-primary-foreground font-semibold rounded-lg px-6 h-10 shadow-lg shadow-teal-600/15"
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
                      autoComplete="current-password"
                      placeholder="********"
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
                      autoComplete="new-password"
                      placeholder="********"
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
                  <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_DESCRIPTION}</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-foreground font-semibold text-sm">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="********"
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
                  disabled={isExportingData}
                  variant="outline" 
                  className="w-full justify-start text-sm border-border/60 hover:bg-secondary/60"
                >
                  <Download className="w-4 h-4 mr-2 text-foreground" />
                  {isExportingData ? 'Exporting Data...' : 'Export My Data (JSON)'}
                </Button>
                <Button 
                  onClick={handleAccountDeletion}
                  disabled={isRequestingDeletion}
                  variant="outline" 
                  className="w-full justify-start text-sm border-resend-red/20 text-resend-red hover:bg-resend-red/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isRequestingDeletion ? 'Submitting Request...' : 'Request Account Deletion'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}




