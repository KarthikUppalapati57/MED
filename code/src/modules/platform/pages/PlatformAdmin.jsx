import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useDebouncedQueryInvalidation } from '@/hooks/useDebouncedQueryInvalidation';
import { useConfirmation } from '@/hooks/useConfirmation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  Shield, Search, Download, CheckCircle2, X, Loader2, Trash2, Mail, Building2, Plus, Copy, DollarSign, ShieldAlert, Video, UserPlus,
  Receipt, History, Fingerprint, Send, FileText, Database, RefreshCw
} from "lucide-react";
import { api } from '@/lib/apiClient';
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_MODULE_KEYS, MODULE_DEFINITIONS } from "@/lib/moduleConfig";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildAppUrl, buildSignupUrl } from '@/lib/appUrl';
import InventoryAudit from '@/modules/accounting/components/InventoryAudit';
import TenantMigrationPanel from '@/modules/platform/components/TenantMigrationPanel';
import PlatformFeedbackSettings from '@/modules/platform/components/PlatformFeedbackSettings';
import { sendEmail, sendInvitationEmail } from '@/lib/emailService';
import posthog from '@/lib/posthog';


const TABS = [
  { id: 'requests', label: 'Requests', icon: ShieldAlert },
  { id: 'invite', label: 'Invite Clients', icon: UserPlus },
  { id: 'ocr', label: 'OCR Review Queue', icon: FileText }
];

const createSecureToken = (length = 20) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  if (!window.crypto?.getRandomValues) {
    throw new Error('Secure random number generation is not available in this browser.');
  }
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
};

const createTenantCouponCode = () => {
  const token = createSecureToken(20);
  return `RST-${token.slice(0, 5)}-${token.slice(5, 10)}-${token.slice(10, 15)}-${token.slice(15, 20)}`;
};

const getInviteCoupon = (invite) => {
  const coupon = invite?.metadata?.coupon || {};
  const code = invite?.metadata?.coupon_code || invite?.coupon_code || coupon.code || '';
  const months = invite?.metadata?.coupon_trial_months || invite?.coupon_trial_months || coupon.trial_months || (coupon.trial_days ? Math.max(1, Math.round(Number(coupon.trial_days) / 30)) : null);
  return { code, months };
};

const ACCESS_LEVELS = [
  { id: 'read', label: 'Read', color: 'sky' },
  { id: 'write', label: 'Write', color: 'emerald' },
  { id: 'update', label: 'Update', color: 'amber' }
];

export default function PlatformAdmin() {
  const { user, role: userRole } = useAuth();
  const { confirm } = useConfirmation();
  const queryClient = useQueryClient();

  const navigate = useNavigate();
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentSubPath = pathParts.length > 1 ? pathParts[1] : '';

  const activeTab = currentSubPath || 'requests';

  const setActiveTab = (tab) => {
    navigate(`/PlatformAdmin/${tab}${location.search}`);
  };

  // Selection/Processing State
  const [processingRequests, setProcessingRequests] = useState(new Set());
  const [selectedRequests, setSelectedRequests] = useState(new Set());
  const [resendingDemos, setResendingDemos] = useState(new Set());
  
  // Organization Hierarchy State
  const [expandedOrgs, setExpandedOrgs] = useState(new Set());
  const [expandedBrands, setExpandedBrands] = useState(new Set());
  const [expandedLocations, setExpandedLocations] = useState(new Set());
  const [showArchivedOrgs, setShowArchivedOrgs] = useState(false);
  
  // Modal States
  const [editingOrgModules, setEditingOrgModules] = useState(null);
  const [selectedModules, setSelectedModules] = useState([]);
  const [addBrandOrgId, setAddBrandOrgId] = useState(null);
  const [newBrandName, setNewBrandName] = useState('');
  const [addLocationTarget, setAddLocationTarget] = useState(null);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({ id: '', name: '', description: '', price_monthly: 0, features: [], is_active: true });
  
  // Invite State
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSelectedModules, setInviteSelectedModules] = useState([...ALL_MODULE_KEYS].filter(k => k !== 'platform'));
  const [inviteRequiresBusinessVerification, setInviteRequiresBusinessVerification] = useState(true);
  const [inviteIncludesCoupon, setInviteIncludesCoupon] = useState(false);
  const [inviteCouponMonths, setInviteCouponMonths] = useState(1);
  const [inviteCouponCode, setInviteCouponCode] = useState("");
  const [inviteAccessLevels, setInviteAccessLevels] = useState({
    read: true,
    write: false,
    update: false
  });
  const [isInviteLinkDialogOpen, setIsInviteLinkDialogOpen] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  const [demoInviteDraft, setDemoInviteDraft] = useState(null);
  const [demoInviteEmail, setDemoInviteEmail] = useState("");
  const [confirmDemoInvite, setConfirmDemoInvite] = useState(false);



  const [accountingSubTab, setAccountingSubTab] = useState('revenue');
  
  // Confirmation Dialog States
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState(null); // stores invitation id
  const [reissuingInviteId, setReissuingInviteId] = useState(null);
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState(null); // stores { id, name }

  const authChecked = !!user;
  const invalidateDemoRequests = useDebouncedQueryInvalidation(queryClient, React.useMemo(() => [['demo-requests']], []), 1500);
  const invalidateContactRequests = useDebouncedQueryInvalidation(queryClient, React.useMemo(() => [['contact-requests']], []), 1500);
  const invalidateAccessRequests = useDebouncedQueryInvalidation(queryClient, React.useMemo(() => [['access-requests']], []), 1500);
  const invalidateOrganizations = useDebouncedQueryInvalidation(queryClient, React.useMemo(() => [['organizations']], []), 1500);
  const invalidateBrands = useDebouncedQueryInvalidation(queryClient, React.useMemo(() => [['all-brands']], []), 1500);
  const invalidateLocations = useDebouncedQueryInvalidation(queryClient, React.useMemo(() => [['all-locations']], []), 1500);
  const invalidateProfiles = useDebouncedQueryInvalidation(queryClient, React.useMemo(() => [['all-profiles']], []), 1500);
  const invalidateClientInvites = useDebouncedQueryInvalidation(queryClient, React.useMemo(() => [['client-invites']], []), 1500);

 // Real-Time Subscriptions 
  React.useEffect(() => {
    if (!authChecked || userRole !== 'platform_admin') return;

    const channel = supabase
      .channel('platform-admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demo_requests' }, invalidateDemoRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_requests' }, invalidateContactRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, invalidateAccessRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, invalidateOrganizations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, invalidateBrands)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, invalidateLocations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, invalidateProfiles)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          queryClient.setQueryData(['client-invites'], (old) => {
            if (!old) return [payload.new];
            // Prevent duplicates if already added by optimistic update
            if (old.some(i => i.id === payload.new.id)) return old;
            return [payload.new, ...old];
          });
        } else if (payload.eventType === 'UPDATE') {
          queryClient.setQueryData(['client-invites'], (old) => {
            if (!old) return old;
            return old.map(i => i.id === payload.new.id ? payload.new : i);
          });
        } else {
          invalidateClientInvites();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authChecked, invalidateAccessRequests, invalidateBrands, invalidateClientInvites, invalidateContactRequests, invalidateDemoRequests, invalidateLocations, invalidateOrganizations, invalidateProfiles, queryClient, userRole]);

  const jwtRole = user?.app_metadata?.role;
  const isReadyAdmin = authChecked && userRole === 'platform_admin' && jwtRole === 'platform_admin';

  const { data: requests = [], isLoading: isLoadingAccess } = useAuthQuery({
    queryKey: ['access-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_requests')
        .select('id, full_name, email, company_name, request_type, status, created_at')
        .neq('request_type', 'demo')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: isReadyAdmin,
  });

  const { data: demoRequests = [], isLoading: isLoadingDemo } = useAuthQuery({
    queryKey: ['demo-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('demo_requests')
        .select('id, full_name, email, company_name, phone, status, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const { data: contactRequests = [], isLoading: isLoadingContact } = useAuthQuery({
    queryKey: ['contact-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_requests')
        .select('id, full_name, email, company_name, message, status, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const { data: orgs = [], isLoading: isLoadingOrgs } = useAuthQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      let q = supabase.from('organizations').select('id, name, slug, status, subscription_status, plan_id, primary_contact_email, enabled_modules, created_at');
      const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const { data: allBrands = [] } = useAuthQuery({
    queryKey: ['all-brands'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brands').select('brand_id, name, organization_id, created_at').limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const { data: allLocations = [] } = useAuthQuery({
    queryKey: ['all-locations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('id, name, brand_id, organization_id, address, is_commissary, created_at').limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const { data: allProfiles = [] } = useAuthQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, role, organization_id, brand_id, location_id');
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const { data: plans = [] } = useAuthQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('price_monthly', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });



  const { data: allClientInvites = [] } = useAuthQuery({
    queryKey: ['client-invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('id, email, role, organization_id, brand_id, location_id, token, accepted_at, expires_at, created_at, metadata')
        .in('role', ['tenant_super_admin', 'owner'])
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && userRole === 'platform_admin',
  });

  const pendingClientInvites = React.useMemo(() => {
    return allClientInvites.filter(invite => {
      const isAccepted = !!invite.accepted_at;
      const hasProfile = allProfiles.some(profile => profile.email?.toLowerCase() === invite.email?.toLowerCase());
      const isExpired = new Date(invite.expires_at) <= new Date();
      return !isAccepted && !hasProfile && !isExpired;
    });
  }, [allClientInvites, allProfiles]);

  const clientHistoryInvites = React.useMemo(() => {
    return allClientInvites.filter(invite => {
      const isAccepted = !!invite.accepted_at;
      const hasProfile = allProfiles.some(profile => profile.email?.toLowerCase() === invite.email?.toLowerCase());
      const isExpired = new Date(invite.expires_at) <= new Date();
      return isAccepted || hasProfile || isExpired;
    });
  }, [allClientInvites, allProfiles]);

 // Mutators & Handlers 
  const handleInviteClient = async () => {
    if (!inviteEmail) { toast.error("Email is required"); return; }
    if (inviteSelectedModules.length === 0) { toast.error("Select at least one module"); return; }
    
    // Check for duplicate pending invitation
    const existingInvite = pendingClientInvites.find(i => i.email?.toLowerCase() === inviteEmail.toLowerCase());
    if (existingInvite) {
      toast.error(`An invitation for ${inviteEmail} already exists. Revoke it first to send a new one.`);
      return;
    }

    const proceed = await confirm({
      title: `Invite ${inviteEmail}?`,
      description: `This creates a tenant_super_admin invitation${inviteIncludesCoupon ? ' with a trial coupon' : ''} and emails a real onboarding link to ${inviteEmail}.`,
      confirmText: 'Generate Onboarding Link',
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!proceed) return;

    const toastId = toast.loading("Generating secure onboarding link & sending email...");
    setInviting(true);
    try {
      const normalizedInviteEmail = inviteEmail.trim().toLowerCase();
      const token = createSecureToken(48);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      let couponMetadata = null;
      if (inviteIncludesCoupon) {
        const trialMonths = Math.max(1, Math.min(24, Number(inviteCouponMonths) || 1));
        const couponCode = createTenantCouponCode();
        const { data: coupon, error: couponErr } = await supabase
          .from('onboarding_coupons')
          .insert({
            code: couponCode,
            description: `${trialMonths} month tenant onboarding trial for ${normalizedInviteEmail}`,
            discount_type: 'trial_days',
            discount_value: 0,
            trial_days: trialMonths * 30,
            max_redemptions: 1,
            active: true,
            starts_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            metadata: {
              source: 'platform_invite',
              invited_email: normalizedInviteEmail,
              trial_months: trialMonths,
              generated_by: user?.id || null,
            },
          })
          .select('id, code, trial_days, expires_at')
          .single();
        if (couponErr) throw couponErr;
        couponMetadata = {
          id: coupon.id,
          code: coupon.code,
          trial_months: trialMonths,
          trial_days: coupon.trial_days,
          expires_at: coupon.expires_at,
        };
      }

      const { data: newInvite, error: insertErr } = await supabase
        .from("invitations")
        .insert([{
          email: normalizedInviteEmail,
          token,
          role: "tenant_super_admin",
          invited_by: user?.id,
          expires_at: expiresAt.toISOString(),
          organization_id: null,
          brand_id: null,
          location_id: null,
          metadata: { 
            modules: inviteSelectedModules,
            access: inviteAccessLevels,
            business_verification_required: inviteRequiresBusinessVerification,
            coupon: couponMetadata,
            coupon_code: couponMetadata?.code || null,
            coupon_trial_months: couponMetadata?.trial_months || null
          }
        }]).select().single();

      if (insertErr) throw insertErr;
      
      // Update cache instantly
      queryClient.setQueryData(['client-invites'], (old) => {
        if (!old) return [newInvite];
        if (old.some(i => i.id === newInvite.id)) return old;
        return [newInvite, ...old];
      });

      const link = buildSignupUrl(token);

      // Send invitation email via EmailJS
      const emailResult = await sendInvitationEmail({
        to_email: normalizedInviteEmail,
        to_name: normalizedInviteEmail.split('@')[0],
        role: "Tenant Super Admin",
        org_name: "Restops Platform",
        invite_link: link,
        coupon_code: couponMetadata?.code || null,
        coupon_trial_months: couponMetadata?.trial_months || null
      });

      setGeneratedInviteLink(link);
      setIsInviteLinkDialogOpen(true);

      // Emit Real-Time Domain Event for the architecture
      const { error: eventErr } = await supabase.rpc('log_frontend_event', {
        p_event_name: 'user.invitation.sent',
        p_entity_type: 'invitation',
        p_entity_id: null,
        p_payload: { email: normalizedInviteEmail, role: 'tenant_super_admin', business_verification_required: inviteRequiresBusinessVerification, coupon_code: couponMetadata?.code || null, coupon_trial_months: couponMetadata?.trial_months || null }
      });
      if (eventErr) console.warn('Failed to emit domain event:', eventErr);

      setInviteEmail("");
      setInviteCouponCode("");
      queryClient.invalidateQueries({ queryKey: ['client-invites'] });

      if (!emailResult.success) {
        console.warn("Email sending failed or skipped:", emailResult.error);
        toast.success("Onboarding link generated, but email notification skipped.", { id: toastId });
      } else {
        toast.success("Onboarding link generated and invitation email sent!", { id: toastId });
      }
      posthog.capture('client_invited', { email: normalizedInviteEmail, role: 'tenant_super_admin', business_verification_required: inviteRequiresBusinessVerification, coupon_code: couponMetadata?.code || null, coupon_trial_months: couponMetadata?.trial_months || null });
    } catch (e) {
      console.error('Invite generation failed:', e);
      toast.error(e.message || "Failed to generate invitation", { id: toastId });
    }
    setInviting(false);
  };

  const openDemoInviteDialog = (request) => {
    setDemoInviteDraft(request);
    setDemoInviteEmail((request.email || "").trim().toLowerCase());
    setConfirmDemoInvite(false);
  };

  const handleAcceptDemo = async (request, onboardingEmailOverride = null) => {
    const onboardingEmail = (onboardingEmailOverride || request.email || "").trim().toLowerCase();
    if (!onboardingEmail || !onboardingEmail.includes("@")) {
      toast.error("Enter a valid onboarding email before sending the invite.");
      return;
    }
    const duplicatePendingInvite = pendingClientInvites.find((invite) => invite.email?.toLowerCase() === onboardingEmail);
    if (duplicatePendingInvite) {
      toast.error(`An active onboarding invitation already exists for ${onboardingEmail}. Revoke it before sending another.`);
      return;
    }

    const toastId = toast.loading(`Accepting request from ${request.full_name} and generating onboarding link for ${onboardingEmail}...`);
    setProcessingRequests(prev => { const n = new Set(prev); n.add(request.id); return n; });
    
    try {
      const token = createSecureToken(48);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // 1. Create invitation
      const { data: newInvite, error: inviteErr } = await supabase
        .from("invitations")
        .insert([{
          email: onboardingEmail,
          token,
          role: "tenant_super_admin",
          invited_by: user?.id,
          expires_at: expiresAt.toISOString(),
          organization_id: null,
          brand_id: null,
          location_id: null,
          metadata: { 
            modules: ALL_MODULE_KEYS.filter(k => k !== 'platform'),
            access: { read: true, write: true, update: true },
            business_verification_required: true,
            demo_request_id: request.id,
            demo_request_email: request.email,
            onboarding_email: onboardingEmail
          }
        }]).select().single();

      if (inviteErr) throw inviteErr;
      
      // Update cache instantly
      queryClient.setQueryData(['client-invites'], (old) => {
        if (!old) return [newInvite];
        if (old.some(i => i.id === newInvite.id)) return old;
        return [newInvite, ...old];
      });

      const signupLink = buildSignupUrl(token);

      // 2. Update demo request status and demo_viewed
      const { error: updateErr } = await supabase
        .from("demo_requests")
        .update({ 
          status: 'accepted',
          demo_viewed: true
        })
        .eq('id', request.id);

      if (updateErr) throw updateErr;

      // 3. Send email via EmailJS
      const emailResult = await sendEmail({
        to_email: onboardingEmail,
        to_name: request.full_name,
        subject: "Your Restops Demo Request has been Approved!",
        message: `
Hi ${request.full_name},

We are thrilled to inform you that your request for a Restops system walkthrough and demo has been approved! 

We have generated a secure, personalized onboarding link so you can set up your tenant super admin account and explore the platform's advanced multi-tenant ecosystem.

This invite is assigned to ${onboardingEmail}. Please use that email address when creating your account or signing in with Google/Microsoft.

Click the link below to create your account and access your environment:
<${signupLink}>

This secure registration link will remain active for 7 days. If you have any questions or require a guided walkthrough with our implementation engineers, please respond directly to this email.

Welcome to the future of multi-tenant enterprise management!

Best regards,
The Restops Platform Team
        `.trim()
      });

      if (!emailResult.success) {
        console.warn("Email sending failed or skipped:", emailResult.error);
        toast.success("Demo request approved and invite link generated, but email notification skipped.", { id: toastId });
      } else {
        toast.success("Demo request accepted! Onboarding link sent to client.", { id: toastId });
      }

      posthog.capture('demo_request_approved', { email: request.email, onboarding_email: onboardingEmail });

      // Refresh queries
      queryClient.invalidateQueries({ queryKey: ['demo-requests'] });
      queryClient.invalidateQueries({ queryKey: ['client-invites'] });

      // Open the link dialog for the admin to see/copy too!
      setGeneratedInviteLink(signupLink);
      setIsInviteLinkDialogOpen(true);
      setDemoInviteDraft(null);
      setDemoInviteEmail("");
      setConfirmDemoInvite(false);

    } catch (err) {
      console.error("Failed to accept demo request:", err);
      toast.error(err.message || "Failed to process request", { id: toastId });
    } finally {
      setProcessingRequests(prev => { const n = new Set(prev); n.delete(request.id); return n; });
    }
  };

  const handleRejectDemo = async (request) => {
    const ok = await confirm({
      title: 'Reject this demo request?',
      description: `This will mark the demo request from ${request.full_name} as rejected and email them a decline notice.`,
      confirmText: 'Reject Request',
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!ok) return;

    const toastId = toast.loading(`Declining request from ${request.full_name}...`);
    setProcessingRequests(prev => { const n = new Set(prev); n.add(request.id); return n; });

    try {
      // 1. Update demo request status and demo_viewed
      const { error: updateErr } = await supabase
        .from("demo_requests")
        .update({ 
          status: 'rejected',
          demo_viewed: true
        })
        .eq('id', request.id);

      if (updateErr) throw updateErr;

      // 2. Send email via EmailJS
      const emailResult = await sendEmail({
        to_email: request.email,
        to_name: request.full_name,
        subject: "Update on your Restops Demo Request",
        message: `
Hi ${request.full_name},

Thank you for your interest in the Restops platform and requesting a demo walkthrough.

After reviewing your company profile and current requirements, we regret to inform you that we are unable to approve your demo request at this time. Our current onboarding pipeline is highly curated to ensure high service standards for matching enterprise profiles.

We will keep your details on file and reach out if our capacity opens up or if there is a better alignment in the future.

Thank you again for your time and interest in Restops.

Best regards,
The Restops Platform Team
        `.trim()
      });

      if (!emailResult.success) {
        console.warn("Email sending failed or skipped:", emailResult.error);
        toast.success("Demo request rejected, but email notification skipped.", { id: toastId });
      } else {
        toast.success("Request rejected and notification email sent.", { id: toastId });
      }
      posthog.capture('demo_request_rejected', { email: request.email });
      queryClient.invalidateQueries({ queryKey: ['demo-requests'] });

    } catch (err) {
      console.error("Failed to reject demo request:", err);
      toast.error(err.message || "Failed to decline request", { id: toastId });
    } finally {
      setProcessingRequests(prev => { const n = new Set(prev); n.delete(request.id); return n; });
    }
  };

 // Resend email for an already-processed demo request 
  const updateContactRequestStatus = async (request, status) => {
    const toastId = toast.loading(`${status === 'accepted' ? 'Accepting' : 'Rejecting'} inquiry from ${request.full_name || request.name || request.email}...`);
    setProcessingRequests(prev => { const n = new Set(prev); n.add(request.id); return n; });

    try {
      const { error } = await supabase
        .from('contact_requests')
        .update({ status })
        .eq('id', request.id);
      if (error) throw error;

      toast.success(`Inquiry ${status}.`, { id: toastId });
      queryClient.invalidateQueries({ queryKey: ['contact-requests'] });
    } catch (err) {
      toast.error(err.message || 'Failed to update inquiry', { id: toastId });
    } finally {
      setProcessingRequests(prev => { const n = new Set(prev); n.delete(request.id); return n; });
    }
  };

  const handleRequestAccept = (request, type) => {
    if (type === 'contact') {
      updateContactRequestStatus(request, 'accepted');
      return;
    }
    // Route through the same review-then-confirm flow as the labeled "Accept & Invite"
    // button (openDemoInviteDialog -> demoInviteDraft dialog -> confirmDemoInvite dialog ->
    // handleAcceptDemo). Previously called handleAcceptDemo(request) directly here, which
    // sent a real tenant_super_admin invite with zero gate.
    openDemoInviteDialog(request);
  };

  const handleRequestReject = async (request, type) => {
    if (type === 'contact') {
      const ok = await confirm({
        title: 'Reject this inquiry?',
        description: `This will mark the inquiry from ${request.full_name || request.name || request.email} as rejected.`,
        confirmText: 'Reject Inquiry',
        cancelText: 'Cancel',
        variant: 'warning',
      });
      if (!ok) return;
      updateContactRequestStatus(request, 'rejected');
      return;
    }
    handleRejectDemo(request);
  };

  const exportRequestData = (data, title) => {
    const headers = ['Name', 'Email', 'Company', 'Plan Or Type', 'Status', 'Submitted'];
    const rows = data.map((request) => [
      request.full_name || request.name || '',
      request.email || '',
      request.company_name || '',
      request.plan || request.request_type || '',
      request.status || 'pending',
      request.created_at ? new Date(request.created_at).toISOString() : '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleResendDemoEmail = async (request) => {
    const toastId = toast.loading(`Resending email to ${request.full_name}...`);
    setResendingDemos(prev => { const n = new Set(prev); n.add(request.id); return n; });

    try {
      if (request.status === 'accepted') {
        // Find the invitation that was created for this demo request.
        // The onboarding/auth email can differ from the original demo contact email.
        let { data: invite } = await supabase
          .from('invitations')
          .select('token, email, metadata')
          .contains('metadata', { demo_request_id: request.id })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!invite) {
          const fallback = await supabase
            .from('invitations')
            .select('token, email, metadata')
            .eq('email', request.email)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          invite = fallback.data;
        }

        const signupLink = invite?.token
          ? buildSignupUrl(invite.token)
          : buildAppUrl('/');

        const onboardingEmail = invite?.email || request.email;

        const emailResult = await sendEmail({
          to_email: onboardingEmail,
          to_name: request.full_name,
          subject: "Your Restops Demo Request has been Approved!",
          message: `
Hi ${request.full_name},

We are thrilled to inform you that your request for a Restops system walkthrough and demo has been approved! 

We have generated a secure, personalized onboarding link so you can set up your tenant super admin account and explore the platform's advanced multi-tenant ecosystem.

This invite is assigned to ${onboardingEmail}. Please use that email address when creating your account or signing in with Google/Microsoft.

Click the link below to create your account and access your environment:
${signupLink}

This secure registration link will remain active for 7 days. If you have any questions or require a guided walkthrough with our implementation engineers, please respond directly to this email.

Welcome to the future of multi-tenant enterprise management!

Best regards,
The Restops Platform Team
          `.trim()
        });

        if (!emailResult.success) {
          toast.error("Email service failed. Please check EmailJS configuration.", { id: toastId });
        } else {
          toast.success("Approval email resent successfully!", { id: toastId });
        }
      } else if (request.status === 'rejected') {
        const emailResult = await sendEmail({
          to_email: request.email,
          to_name: request.full_name,
          subject: "Update on your Restops Demo Request",
          message: `
Hi ${request.full_name},

Thank you for your interest in the Restops platform and requesting a demo walkthrough.

After reviewing your company profile and current requirements, we regret to inform you that we are unable to approve your demo request at this time. Our current onboarding pipeline is highly curated to ensure high service standards for matching enterprise profiles.

We will keep your details on file and reach out if our capacity opens up or if there is a better alignment in the future.

Thank you again for your time and interest in Restops.

Best regards,
The Restops Platform Team
          `.trim()
        });

        if (!emailResult.success) {
          toast.error("Email service failed. Please check EmailJS configuration.", { id: toastId });
        } else {
          toast.success("Rejection email resent successfully!", { id: toastId });
        }
      }
    } catch (err) {
      console.error("Failed to resend demo email:", err);
      toast.error(err.message || "Failed to resend email", { id: toastId });
    } finally {
      setResendingDemos(prev => { const n = new Set(prev); n.delete(request.id); return n; });
    }
  };

  const handleDeleteInvite = async (id) => {
    setConfirmDeleteInvite(null);
    const toastId = toast.loading("Revoking invitation...");
    
    await queryClient.cancelQueries({ queryKey: ['client-invites'] });
    const prev = queryClient.getQueryData(['client-invites']);
    
    try {
      const { error } = await supabase
        .from('invitations')
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', id);
      if (error) throw error;
      
      toast.success("Invitation revoked & moved to history", { id: toastId });
      queryClient.invalidateQueries({ queryKey: ['client-invites'] });
    } catch (err) {
      if (prev) queryClient.setQueryData(['client-invites'], prev);
      toast.error("Failed to revoke invitation", { id: toastId });
    }
  };
  
  const handleReissueInvite = async (invitationId) => {
    setReissuingInviteId(invitationId);
    try {
      const result = await api.onboarding.reissueOwnerInvitation(invitationId);
      const signupLink = buildSignupUrl(result.token);
      await navigator.clipboard.writeText(signupLink).catch(() => {});
      toast.success('Invitation reissued. New signup link copied to clipboard.');
      queryClient.invalidateQueries({ queryKey: ['client-invites'] });
    } catch (err) {
      toast.error(err.message || 'Failed to reissue invitation');
    } finally {
      setReissuingInviteId(null);
    }
  };

  const handleDeleteOrg = async (id) => {
    setConfirmDeleteOrg(null);
    const toastId = toast.loading("Deactivating organization...");
    
    await queryClient.cancelQueries({ queryKey: ['organizations'] });
    const prev = queryClient.getQueryData(['organizations']);
    queryClient.setQueryData(['organizations'], old => old ? old.filter(o => o.id !== id) : []);
  
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ status: 'archived' })
        .eq('id', id);
      if (error) throw error;
      
      posthog.capture('organization_deleted', { org_id: id });
      toast.success("Organization archived", { id: toastId });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    } catch (err) {
      if (prev) queryClient.setQueryData(['organizations'], prev);
      console.error(err);
      toast.error("Failed to archive organization", { id: toastId });
    }
  };

  const toggleOrg = (id) => {
    setExpandedOrgs(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleBrand = (id) => {
    setExpandedBrands(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleLocation = (id) => {
    setExpandedLocations(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // Precomputed Brand/Location lookup Maps for O(1) retrieval during organization hierarchy rendering
  const orgBrandsMap = React.useMemo(() => {
    const map = new Map();
    allBrands.forEach(brand => {
      const orgId = brand.organization_id;
      if (orgId) {
        if (!map.has(orgId)) {
          map.set(orgId, []);
        }
        map.get(orgId).push(brand);
      }
    });
    return map;
  }, [allBrands]);

  const brandLocationsMap = React.useMemo(() => {
    const map = new Map();
    allLocations.forEach(loc => {
      const brandId = loc.brand_id;
      if (brandId) {
        if (!map.has(brandId)) {
          map.set(brandId, []);
        }
        map.get(brandId).push(loc);
      }
    });
    return map;
  }, [allLocations]);

  const getOrgBrands = React.useCallback((orgId) => orgBrandsMap.get(orgId) || [], [orgBrandsMap]);
  const getBrandLocations = React.useCallback((brandId) => brandLocationsMap.get(brandId) || [], [brandLocationsMap]);

  const orgUsersMap = React.useMemo(() => {
    const map = new Map();
    allProfiles.forEach(user => {
      if (user.organization_id && !user.brand_id && !user.location_id) {
        if (!map.has(user.organization_id)) map.set(user.organization_id, []);
        map.get(user.organization_id).push(user);
      }
    });
    return map;
  }, [allProfiles]);

  const brandUsersMap = React.useMemo(() => {
    const map = new Map();
    allProfiles.forEach(user => {
      if (user.brand_id && !user.location_id) {
        if (!map.has(user.brand_id)) map.set(user.brand_id, []);
        map.get(user.brand_id).push(user);
      }
    });
    return map;
  }, [allProfiles]);

  const locationUsersMap = React.useMemo(() => {
    const map = new Map();
    allProfiles.forEach(user => {
      if (user.location_id) {
        if (!map.has(user.location_id)) map.set(user.location_id, []);
        map.get(user.location_id).push(user);
      }
    });
    return map;
  }, [allProfiles]);

  const getOrgUsers = React.useCallback((orgId) => orgUsersMap.get(orgId) || [], [orgUsersMap]);
  const getBrandUsers = React.useCallback((brandId) => brandUsersMap.get(brandId) || [], [brandUsersMap]);
  const getLocationUsers = React.useCallback((locId) => locationUsersMap.get(locId) || [], [locationUsersMap]);

  const locationCountByOrganization = React.useMemo(() => allLocations.reduce((acc, loc) => {
    if (!loc.organization_id) return acc;
    acc[loc.organization_id] = (acc[loc.organization_id] || 0) + 1;
    return acc;
  }, {}), [allLocations]);

  const estimatedPlatformMrr = React.useMemo(() => orgs.reduce((sum, org) => {
    const plan = plans.find((item) => item.id === org.plan_id);
    if (!plan?.price_monthly) return sum;
    return sum + Number(plan.price_monthly || 0) * Math.max(1, locationCountByOrganization[org.id] || 0);
  }, 0), [orgs, plans, locationCountByOrganization]);

 // Computed Stats 
  const {
    accessReqs,
    contactReqs,
    pendingAccessCount,
    pendingContactCount,
    pendingOrgCount,
    pendingCount
  } = React.useMemo(() => {
    const access = requests.filter(r => r.request_type !== 'demo');
    const contact = contactRequests;
    const pendingAccess = access.filter(r => r.status === 'pending_approval' || r.status === 'under_review').length;
    const pendingContact = contact.filter(r => r.status === 'pending_approval').length;
    const pendingOrg = orgs.filter(o => o.status === 'pending_approval' || o.status === 'under_review' || o.status === 'onboarding').length;
    const pending = pendingAccess + pendingContact + pendingOrg;
    return {
      accessReqs: access,
      contactReqs: contact,
      pendingAccessCount: pendingAccess,
      pendingContactCount: pendingContact,
      pendingOrgCount: pendingOrg,
      pendingCount: pending
    };
  }, [requests, contactRequests, orgs]);

 // Tab Renderers 
  const renderRequestTable = (data, title, pCount, type) => (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{data.length} total / {pCount} pending</p>
        </div>
        <div className="flex gap-2">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-9 w-48 h-8 rounded-xl border-border" /></div>
          <Button variant="outline" size="sm" className="rounded-xl border-border" onClick={() => exportRequestData(data, title)}><Download className="w-4 h-4 mr-1" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead className="text-[11px] font-bold">APPLICANT</TableHead>
              <TableHead className="text-[11px] font-bold">COMPANY</TableHead>
              <TableHead className="text-[11px] font-bold">PLAN/TYPE</TableHead>
              <TableHead className="text-[11px] font-bold">STATUS</TableHead>
              <TableHead className="text-[11px] font-bold">SUBMITTED</TableHead>
              <TableHead className="text-[11px] font-bold">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No requests found</TableCell></TableRow>
            ) : data.map(r => (
              <TableRow key={r.id} className="hover:bg-secondary/50 transition-colors">
                <TableCell>
                  <p className="text-sm font-semibold text-foreground">{r.full_name || r.name}</p>
                  <p className="text-[10px] text-muted-foreground">{r.email}</p>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.company_name || 'â€”'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] capitalize bg-card">{r.plan || r.request_type || 'â€”'}</Badge>
                </TableCell>
                <TableCell>
                  <Badge className={cn(
                    "text-[10px] font-bold border-none",
                    r.status === 'approved' ? 'bg-resend-green/10 text-resend-green' : 
                    r.status === 'rejected' ? 'bg-resend-red/10 text-resend-red' : 'bg-resend-yellow/10 text-resend-yellow'
                  )}>
                    {r.status || 'pending'}
                  </Badge>
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-resend-green" disabled={processingRequests.has(r.id)} onClick={() => handleRequestAccept(r, type)}><CheckCircle2 className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-resend-red" disabled={processingRequests.has(r.id)} onClick={() => handleRequestReject(r, type)}><X className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderInviteTab = () => (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="bg-slate-900 px-6 py-8 text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-card/10 backdrop-blur-md rounded-2xl border border-white/10">
                <UserPlus className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Invite New Client</h2>
                <p className="text-muted-foreground text-sm">Generate secure onboarding links for Tenant Super Admins</p>
              </div>
            </div>
          </div>
          <div className="absolute -right-12 -top-12 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-resend-blue/50/10 rounded-full blur-3xl" />
        </div>
        <CardContent className="p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-foreground">Client Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="owner@new-organization.com" 
                    className="pl-10 h-12 rounded-xl border-border"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
                <div className="flex flex-col gap-4">
                  <div>
                    <Label className="text-sm font-bold text-foreground">Require Business Verification?</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose whether this tenant must complete EIN/SSN verification before hierarchy setup.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={inviteRequiresBusinessVerification}
                      onClick={() => setInviteRequiresBusinessVerification(true)}
                      className={cn(
                        "h-11 rounded-xl border text-sm font-bold transition-all",
                        inviteRequiresBusinessVerification
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      Yes, Verify
                    </button>
                    <button
                      type="button"
                      aria-pressed={!inviteRequiresBusinessVerification}
                      onClick={() => setInviteRequiresBusinessVerification(false)}
                      className={cn(
                        "h-11 rounded-xl border text-sm font-bold transition-all",
                        !inviteRequiresBusinessVerification
                          ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                          : "border-border bg-card text-muted-foreground hover:border-amber-400"
                      )}
                    >
                      No, Skip
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {inviteRequiresBusinessVerification
                    ? 'Tenant will see business verification during onboarding'
                    : 'Tenant will skip business verification and continue to hierarchy setup'}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
                <div className="flex flex-col gap-4">
                  <div>
                    <Label className="text-sm font-bold text-foreground">Include Coupon / Trial?</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Send a one-use trial coupon with the onboarding link. It can only be redeemed by this invited email.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={!inviteIncludesCoupon}
                      onClick={() => setInviteIncludesCoupon(false)}
                      className={cn(
                        "h-11 rounded-xl border text-sm font-bold transition-all",
                        !inviteIncludesCoupon
                          ? "border-border bg-slate-900 text-white shadow-sm"
                          : "border-border bg-card text-muted-foreground hover:border-slate-400"
                      )}
                    >
                      No Coupon
                    </button>
                    <button
                      type="button"
                      aria-pressed={inviteIncludesCoupon}
                      onClick={() => setInviteIncludesCoupon(true)}
                      className={cn(
                        "h-11 rounded-xl border text-sm font-bold transition-all",
                        inviteIncludesCoupon
                          ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                          : "border-border bg-card text-muted-foreground hover:border-emerald-400"
                      )}
                    >
                      Yes, Add Coupon
                    </button>
                  </div>
                </div>
                {inviteIncludesCoupon && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr]">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">Trial Months</Label>
                      <Input
                        type="number"
                        min="1"
                        max="24"
                        value={inviteCouponMonths}
                        onChange={(event) => setInviteCouponMonths(event.target.value)}
                        className="h-10 rounded-xl bg-card"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">Coupon Code</Label>
                      <div className="flex h-10 items-center rounded-xl border border-border bg-muted/30 px-3 text-xs font-semibold text-muted-foreground">
                        Secure one-use code generated on send
                      </div>
                    </div>
                  </div>
                )}
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {inviteIncludesCoupon
                    ? `${Math.max(1, Math.min(24, Number(inviteCouponMonths) || 1))} month coupon will be sent with the invite email`
                    : 'Tenant will choose plan and pay normally'}
                </p>
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-bold text-foreground">Granular Access Permissions</Label>
                <div className="grid grid-cols-3 gap-3">
                  {ACCESS_LEVELS.map(level => (
                    <button
                      key={level.id}
                      onClick={() => setInviteAccessLevels(prev => ({ ...prev, [level.id]: !prev[level.id] }))}
                      className={cn(
                        "flex flex-col items-center p-4 rounded-2xl border transition-all",
                        inviteAccessLevels[level.id] 
                          ? `bg-${level.color}-50 border-${level.color}-600 ring-2 ring-${level.color}-100` 
                          : "bg-card border-border text-muted-foreground hover:border-border"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center mb-2",
                        inviteAccessLevels[level.id] 
                          ? `bg-${level.color}-600 text-white` 
                          : "bg-secondary"
                      )}>
                        <Fingerprint className="w-5 h-5" />
                      </div>
                      <span className={cn("text-xs font-bold", inviteAccessLevels[level.id] ? "text-foreground" : "text-muted-foreground")}>
                        {level.label}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground italic">Determines if the client can read, create (write), or modify (update) records.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold text-foreground">Enable Platform Modules</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] text-primary font-bold"
                  onClick={() => {
                    const clientModules = ALL_MODULE_KEYS.filter(k => k !== 'platform');
                    setInviteSelectedModules(prev => prev.length === clientModules.length ? [] : [...clientModules]);
                  }}
                >
                  {inviteSelectedModules.length === ALL_MODULE_KEYS.length ? "Clear All" : "Select All"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MODULE_KEYS.filter(k => k !== 'platform').map(key => {
                  const mod = MODULE_DEFINITIONS[key];
                  const isSelected = inviteSelectedModules.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => setInviteSelectedModules(prev => 
                        isSelected ? prev.filter(k => k !== key) : [...prev, key]
                      )}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-xl border text-left transition-all",
                        isSelected 
                          ? "bg-secondary border-slate-900 shadow-sm" 
                          : "bg-card border-border text-muted-foreground hover:border-border"
                      )}
                    >
                      <Checkbox checked={isSelected} className="pointer-events-none" />
                      <span className="text-xs font-medium">{mod.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-border flex justify-end">
            <Button 
              className="bg-slate-900 hover:bg-slate-800 text-white h-12 px-8 rounded-xl shadow-lg"
              disabled={inviting || !inviteEmail || inviteSelectedModules.length === 0}
              onClick={handleInviteClient}
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Generate Onboarding Link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Pending Client Invitations</CardTitle>
          <p className="text-xs text-muted-foreground">Recently generated links that haven't been accepted yet</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="text-[11px] font-bold">CLIENT EMAIL</TableHead>
                <TableHead className="text-[11px] font-bold">MODULES</TableHead>
                <TableHead className="text-[11px] font-bold">ACCESS</TableHead>
                <TableHead className="text-[11px] font-bold">COUPON</TableHead>
                <TableHead className="text-[11px] font-bold">CREATED</TableHead>
                <TableHead className="text-[11px] font-bold">STATUS</TableHead>
                <TableHead className="text-[11px] font-bold">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingClientInvites.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No pending invitations</TableCell></TableRow>
              ) : pendingClientInvites.map(invite => {
                const coupon = getInviteCoupon(invite);
                return (
                <TableRow key={invite.id} className="hover:bg-secondary/50 transition-colors">
                  <TableCell className="font-semibold text-sm text-foreground">{invite.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {invite.metadata?.modules?.map(m => (
                        <Badge key={m} variant="secondary" className="text-[9px] px-1.5 py-0 bg-secondary text-muted-foreground">
                          {MODULE_DEFINITIONS[m]?.label || m}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {Object.entries(invite.metadata?.access || {}).filter(([_, v]) => v).map(([k]) => (
                        <Badge key={k} className="bg-resend-blue/5 text-resend-blue text-[9px] uppercase font-bold border-none">{k}</Badge>
                      ))}
                      {invite.metadata?.business_verification_required === false && (
                        <Badge className="bg-amber-100 text-amber-700 text-[9px] uppercase font-bold border-none">No verification</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {coupon.code ? (
                      <Badge className="bg-emerald-100 text-emerald-700 text-[9px] font-bold border-none">
                        {coupon.code}{coupon.months ? ` - ${coupon.months} mo` : ''}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground">{new Date(invite.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge className="bg-pink-100 text-pink-700 text-[9px] font-bold border-none">Delivered</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-resend-blue hover:bg-resend-blue/5"
                        title="Copy Invite Link"
                        onClick={() => {
                          const link = buildSignupUrl(invite.token);
                          navigator.clipboard.writeText(link);
                          toast.success("Invite link copied to clipboard!");
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5"
                        title="Resend Invite"
                        onClick={async () => {
                          toast.loading("Resending invite...", { id: 'resend-invite' });
                          const link = buildSignupUrl(invite.token);
                          const emailResult = await sendInvitationEmail({
                            to_email: invite.email,
                            to_name: invite.email.split('@')[0],
                            role: "Tenant Super Admin",
                            org_name: "Restops Platform",
                            invite_link: link,
                            coupon_code: coupon.code || null,
                            coupon_trial_months: coupon.months || null
                          });
                          
                          if (!emailResult.success) {
                            toast.error(`Failed to resend: ${emailResult.error}`, { id: 'resend-invite' });
                          } else {
                            toast.success("Invite resent successfully!", { id: 'resend-invite' });
                          }
                        }}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
                        title="Delete Invite"
                        onClick={() => setConfirmDeleteInvite(invite.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/20 px-8 py-5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl font-black flex items-center gap-2">
              <History className="w-5 h-5 text-resend-blue" />
              Accepted Clients & History
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Record of completed, expired, or manually revoked invitations</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="text-[11px] font-bold">CLIENT EMAIL</TableHead>
                <TableHead className="text-[11px] font-bold">MODULES</TableHead>
                <TableHead className="text-[11px] font-bold">COUPON</TableHead>
                <TableHead className="text-[11px] font-bold">CREATED</TableHead>
                <TableHead className="text-[11px] font-bold">STATUS</TableHead>
                <TableHead className="text-[11px] font-bold text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientHistoryInvites.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No history available</TableCell></TableRow>
              ) : clientHistoryInvites.map(invite => {
                const isAccepted = !!invite.accepted_at;
                const hasProfile = allProfiles.some(profile => profile.email?.toLowerCase() === invite.email?.toLowerCase());
                const isExpired = new Date(invite.expires_at) <= new Date();
                const coupon = getInviteCoupon(invite);
                
                let statusBadge;
                if (isAccepted || hasProfile) {
                  statusBadge = <Badge className="bg-emerald-100 text-emerald-700 text-[9px] font-bold border-none">Accepted</Badge>;
                } else if (isExpired) {
                  statusBadge = <Badge className="bg-muted text-muted-foreground text-[9px] font-bold border-none">Expired / Revoked</Badge>;
                }

                return (
                  <TableRow key={invite.id} className="hover:bg-secondary/50 transition-colors">
                    <TableCell className="font-semibold text-sm text-foreground opacity-70">{invite.email}</TableCell>
                    <TableCell className="opacity-70">
                      <div className="flex flex-wrap gap-1">
                        {invite.metadata?.modules?.map(m => (
                          <Badge key={m} variant="secondary" className="text-[9px] px-1.5 py-0 bg-secondary text-muted-foreground">
                            {MODULE_DEFINITIONS[m]?.label || m}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="opacity-70">
                      {coupon.code ? (
                        <Badge className="bg-emerald-100 text-emerald-700 text-[9px] font-bold border-none">
                          {coupon.code}{coupon.months ? ` - ${coupon.months} mo` : ''}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground opacity-70">{new Date(invite.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{statusBadge}</TableCell>
                    <TableCell className="text-right">
                      {isExpired && !isAccepted && !hasProfile && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] font-bold"
                          disabled={reissuingInviteId === invite.id}
                          onClick={() => handleReissueInvite(invite.id)}
                        >
                          {reissuingInviteId === invite.id ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                          Reissue
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="p-6 space-y-8 min-h-screen bg-secondary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Platform Console</h1>
              {pendingCount > 0 && (
                <Badge className="bg-resend-yellow/10 text-resend-yellow hover:bg-resend-yellow/10 border-none font-bold px-3 py-1">
                  {pendingCount} Action Required
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">Global infrastructure & organization governance Â· v2.1.0</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="rounded-xl border-border h-10 px-6"
            onClick={() => setActiveTab('tenant-migration')}
          >
            <Database className="w-4 h-4 mr-2" />
            Tenant Migration
          </Button>
          <Button 
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-10 px-6 shadow-sm"
            onClick={() => setActiveTab('invite')}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Quick Invite
          </Button>
          <Button 
            variant="outline" 
            className="rounded-xl border-border h-10 px-6"
            onClick={() => window.open('/dev-monitor.html', '_blank')}
          >
            System Status
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Organizations', value: orgs.length, sub: 'Registered tenants', icon: Building2, color: 'blue' },
          { label: 'Demo Requests', value: demoRequests.length, sub: `${demoRequests.filter(r => r.demo_viewed).length} viewed`, icon: Video, color: 'violet' },
          { label: 'Pending Approvals', value: pendingCount, sub: 'Immediate action', icon: ShieldAlert, color: 'amber' },
          { label: 'Platform MRR', value: `$${estimatedPlatformMrr.toLocaleString()}`, sub: 'Estimated per-location monthly', icon: DollarSign, color: 'emerald' },
        ].map(stat => (
          <Card key={stat.label} className="border-0 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
            <CardContent className="p-6 relative">
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-2">{stat.value}</p>
                  <p className={cn("text-[10px] font-medium mt-1", `text-${stat.color}-500`)}>{stat.sub}</p>
                </div>
                <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", `bg-${stat.color}-50 text-${stat.color}-600`)}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
              <div className={cn("absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-2xl opacity-10", `bg-${stat.color}-400`)} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Horizontal tabs removed in favor of sidebar navigation */}

        <div className="space-y-6">
          <TabsContent value="requests" className="mt-0 outline-none focus-visible:ring-0 space-y-6">
            {renderRequestTable(accessReqs, "Access Requests", pendingAccessCount, "access")}
            
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <div>
                  <CardTitle className="text-base">Demo Inquiries</CardTitle>
                  <p className="text-xs text-muted-foreground">Prospective clients interested in system walkthroughs</p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50">
                      <TableHead className="text-[11px] font-bold">APPLICANT</TableHead>
                      <TableHead className="text-[11px] font-bold">COMPANY</TableHead>
                      <TableHead className="text-[11px] font-bold">STATUS</TableHead>
                      <TableHead className="text-[11px] font-bold">SUBMITTED</TableHead>
                      <TableHead className="text-[11px] font-bold">ACTIONS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demoRequests.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <p className="font-bold text-sm">{r.full_name}</p>
                          <p className="text-[10px] text-muted-foreground">{r.email}</p>
                        </TableCell>
                        <TableCell className="text-sm">{r.company_name}</TableCell>
                        <TableCell>
                          <Badge 
                            className={cn(
                              "text-[10px] font-bold border-none capitalize",
                              r.status === 'accepted' ? 'bg-resend-green/10 text-resend-green' :
                              r.status === 'rejected' ? 'bg-resend-red/10 text-resend-red' : 'bg-resend-yellow/10 text-resend-yellow'
                            )}
                          >
                            {r.status || 'new'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {(r.status === 'new' || !r.status) ? (
                              <>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 px-3 text-xs bg-resend-green/5 hover:bg-resend-green/10 text-resend-green border-resend-green/20 font-bold rounded-xl flex items-center"
                                  disabled={processingRequests.has(r.id)}
                                  onClick={() => openDemoInviteDialog(r)}
                                >
                                  {processingRequests.has(r.id) ? (
                                    <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                                  ) : (
                                    <CheckCircle2 className="w-3 h-3 mr-1.5" />
                                  )}
                                  Accept & Invite
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 px-3 text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 font-bold rounded-xl flex items-center"
                                  disabled={processingRequests.has(r.id)}
                                  onClick={() => handleRejectDemo(r)}
                                >
                                  {processingRequests.has(r.id) ? (
                                    <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                                  ) : (
                                    <X className="w-3 h-3 mr-1.5" />
                                  )}
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge className={cn(
                                  "text-[9px] font-bold border-none capitalize",
                                  r.status === 'accepted' ? 'bg-resend-green/5 text-resend-green' : 'bg-resend-red/5 text-resend-red'
                                )}>
                                  {r.status}
                                </Badge>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-7 px-2.5 text-[10px] bg-resend-blue/5 hover:bg-resend-blue/10 text-resend-blue border-resend-blue/20 font-bold rounded-lg flex items-center gap-1"
                                  disabled={resendingDemos.has(r.id)}
                                  onClick={() => handleResendDemoEmail(r)}
                                  title={r.status === 'accepted' ? 'Resend approval email with invite link' : 'Resend rejection notification'}
                                >
                                  {resendingDemos.has(r.id) ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Mail className="w-3 h-3" />
                                  )}
                                  Resend
                                </Button>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact" className="mt-0 outline-none">
            {renderRequestTable(contactReqs, "General Inquiries", pendingContactCount, "contact")}
          </TabsContent>

          <TabsContent value="invite" className="mt-0 outline-none">
            {renderInviteTab()}
          </TabsContent>

          <TabsContent value="accounting" className="mt-0 outline-none">
             <div className="space-y-6">
               <div className="flex gap-4 border-b border-border pb-4">
                 <button 
                  onClick={() => setAccountingSubTab('revenue')}
                  className={cn(
                    "text-xs font-bold px-4 py-2 rounded-lg transition-all",
                    accountingSubTab === 'revenue' ? "bg-slate-900 text-white shadow-sm" : "text-muted-foreground hover:text-muted-foreground"
                  )}
                 >
                   Revenue Overview
                 </button>
                 <button 
                  onClick={() => setAccountingSubTab('audit')}
                  className={cn(
                    "text-xs font-bold px-4 py-2 rounded-lg transition-all",
                    accountingSubTab === 'audit' ? "bg-slate-900 text-white shadow-sm" : "text-muted-foreground hover:text-muted-foreground"
                  )}
                 >
                   Inventory Auditing
                 </button>
               </div>

               {accountingSubTab === 'revenue' ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                   <Card className="border-0 shadow-sm">
                     <CardHeader><CardTitle className="text-base">Revenue Breakdown</CardTitle></CardHeader>
                     <CardContent>
                        <div className="space-y-6">
                          {plans.map(plan => {
                            const planOrgs = orgs.filter(o => o.plan_id === plan.id);
                            const count = planOrgs.length;
                            const locationCount = planOrgs.reduce((sum, org) => sum + Math.max(1, locationCountByOrganization[org.id] || 0), 0);
                            return (
                              <div key={plan.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center font-bold text-muted-foreground">{plan.name[0]}</div>
                                   <div>
                                      <p className="font-bold text-sm">{plan.name}</p>
                                      <p className="text-[10px] text-muted-foreground">{count} organizations - {locationCount} billable locations</p>
                                   </div>
                                </div>
                                <p className="font-black text-foreground">${(locationCount * plan.price_monthly).toLocaleString()}</p>
                              </div>
                            )
                          })}
                        </div>
                     </CardContent>
                   </Card>
                   <Card className="border-0 shadow-sm">
                     <CardHeader><CardTitle className="text-base">Platform Invoicing</CardTitle></CardHeader>
                     <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 bg-secondary rounded-3xl flex items-center justify-center mb-4"><Receipt className="w-8 h-8 text-muted-foreground" /></div>
                        <p className="font-bold text-foreground">No pending invoices</p>
                        <p className="text-xs text-muted-foreground mt-1">All organization payments are up to date.</p>
                     </CardContent>
                   </Card>
                 </div>
               ) : (
                 <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <InventoryAudit />
                 </div>
               )}
             </div>
          </TabsContent>

          <TabsContent value="tenant-migration" className="mt-0 outline-none">
            <TenantMigrationPanel />
          </TabsContent>
          <TabsContent value="feedback-settings" className="mt-0 outline-none">
            <PlatformFeedbackSettings />
          </TabsContent>

          <TabsContent value="ocr">
            <Card className="border-0 shadow-sm border-t-4 border-t-resend-yellow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-5 h-5 text-resend-yellow" />
                  Manual OCR Review Queue
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Invoices flagged by the AI engine with a confidence score &lt; 80%. These require human validation before being posted to the client's ledger.
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Received</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Reason Flagged</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>10 mins ago</TableCell>
                      <TableCell className="font-medium">Osteria Morini</TableCell>
                      <TableCell>Local Farm Prod.</TableCell>
                      <TableCell><Badge className="bg-rose-50 text-rose-700 border-rose-200">42%</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">Handwritten totals illegible</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="default" onClick={() => toast.success("Opening Human-in-the-loop Transcription Interface...")}>Review</Button>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>1 hour ago</TableCell>
                      <TableCell className="font-medium">Burger Palace</TableCell>
                      <TableCell>Sysco</TableCell>
                      <TableCell><Badge className="bg-amber-50 text-amber-700 border-amber-200">75%</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">Missing Invoice Number</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="default" onClick={() => toast.success("Opening Human-in-the-loop Transcription Interface...")}>Review</Button>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>2 hours ago</TableCell>
                      <TableCell className="font-medium">Osteria Morini</TableCell>
                      <TableCell>Ecolab</TableCell>
                      <TableCell><Badge className="bg-amber-50 text-amber-700 border-amber-200">79%</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">Water damage / smeared ink</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="default" onClick={() => toast.success("Opening Human-in-the-loop Transcription Interface...")}>Review</Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

        </div>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={!!editingOrgModules} onOpenChange={() => setEditingOrgModules(null)}>
        <DialogContent className="max-w-lg rounded-3xl border-none shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Configure Modules</DialogTitle>
            <DialogDescription>Modify access for {editingOrgModules?.name}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-6">
            {ALL_MODULE_KEYS.map(key => {
               const mod = MODULE_DEFINITIONS[key];
               const checked = selectedModules.includes(key);
               return (
                 <div 
                  key={key} 
                  onClick={() => setSelectedModules(prev => checked ? prev.filter(k => k !== key) : [...prev, key])}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all",
                    checked ? "bg-slate-900 border-slate-900 text-white shadow-lg" : "bg-card border-border hover:border-border"
                  )}
                 >
                    <Checkbox checked={checked} className={cn("border-border", checked && "border-white bg-card text-foreground")} />
                    <span className="text-xs font-bold">{mod?.label || key}</span>
                 </div>
               )
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingOrgModules(null)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-8" onClick={async () => {
              const ok = await confirm({
                title: 'Save module configuration?',
                description: `This changes which modules ${editingOrgModules?.name} can access.`,
                confirmText: 'Save Configuration',
                cancelText: 'Cancel',
                variant: 'warning',
              });
              if (!ok) return;
              await supabase.from('organizations').update({ enabled_modules: selectedModules }).eq('id', editingOrgModules.id);
              queryClient.invalidateQueries({ queryKey: ['organizations'] });
              toast.success("Modules updated");
              setEditingOrgModules(null);
            }}>Save Configuration</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!demoInviteDraft} onOpenChange={(open) => { if (!open) { setDemoInviteDraft(null); setDemoInviteEmail(""); } }}>
        <DialogContent className="max-w-lg rounded-3xl border-none shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Approve Demo Request</DialogTitle>
            <DialogDescription>
              Confirm the email that should own the tenant onboarding account before sending the secure invite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="rounded-2xl border bg-secondary/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Demo request contact</p>
              <p className="mt-2 text-sm font-bold text-foreground">{demoInviteDraft?.full_name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground">{demoInviteDraft?.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">{demoInviteDraft?.company_name}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-onboarding-email">Onboarding account email</Label>
              <Input
                id="demo-onboarding-email"
                type="email"
                value={demoInviteEmail}
                onChange={(event) => setDemoInviteEmail(event.target.value)}
                placeholder="owner@company.com"
                className="h-11 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">The tenant must sign up or use Google/Microsoft SSO with this email. The original demo email remains saved for sales history.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDemoInviteDraft(null); setDemoInviteEmail(""); setConfirmDemoInvite(false); }}>Cancel</Button>
            <Button
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-6"
              disabled={!demoInviteEmail.trim() || processingRequests.has(demoInviteDraft?.id)}
              onClick={() => setConfirmDemoInvite(true)}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDemoInvite} onOpenChange={setConfirmDemoInvite}>
        <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Are you sure you want to proceed?</DialogTitle>
            <DialogDescription>
              This will generate a secure onboarding link, bind it to the selected onboarding email, and send the invite.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border bg-secondary/40 p-4 my-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Onboarding email</p>
            <p className="mt-2 text-sm font-bold text-foreground">{demoInviteEmail}</p>
            <p className="mt-2 text-xs text-muted-foreground">Original demo contact: {demoInviteDraft?.email}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDemoInvite(false)}>No, go back</Button>
            <Button
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-6"
              disabled={processingRequests.has(demoInviteDraft?.id)}
              onClick={() => handleAcceptDemo(demoInviteDraft, demoInviteEmail)}
            >
              {processingRequests.has(demoInviteDraft?.id) ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : <><Send className="mr-2 h-4 w-4" /> Yes, Send Invite</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInviteLinkDialogOpen} onOpenChange={setIsInviteLinkDialogOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl p-10 text-center">
          <div className="w-20 h-20 bg-resend-green/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-resend-green" />
          </div>
          <DialogTitle className="text-3xl font-black mb-2">Link Generated!</DialogTitle>
          <p className="text-muted-foreground mb-8">Share this onboarding link with the client to begin their registration.</p>
          <div className="relative mb-8">
            <Input readOnly value={generatedInviteLink} className="bg-secondary h-12 pr-12 rounded-xl border-border font-mono text-xs" />
            <Button variant="ghost" size="sm" className="absolute right-1 top-1 h-10 w-10 p-0 hover:bg-card" onClick={() => { navigator.clipboard.writeText(generatedInviteLink); toast.success("Copied to clipboard"); }}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <Button className="w-full bg-slate-900 h-12 rounded-xl font-bold" onClick={() => setIsInviteLinkDialogOpen(false)}>Done</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!confirmDeleteInvite} onOpenChange={() => setConfirmDeleteInvite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Invitation</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke this onboarding link? The link will immediately become invalid.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteInvite(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDeleteInvite(confirmDeleteInvite)}>Revoke Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteOrg} onOpenChange={() => setConfirmDeleteOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Organization</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate {confirmDeleteOrg?.name}? This will restrict access for all users in this organization.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteOrg(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDeleteOrg(confirmDeleteOrg?.id)}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
