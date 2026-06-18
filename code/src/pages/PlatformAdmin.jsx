import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useDebouncedQueryInvalidation } from '@/hooks/useDebouncedQueryInvalidation';
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
  Receipt, History, Fingerprint, Send, FileText
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_MODULE_KEYS, MODULE_DEFINITIONS } from "@/lib/moduleConfig";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import InventoryAudit from '@/components/accounting/InventoryAudit';
import { sendEmail, sendInvitationEmail } from '@/lib/emailService';
import posthog from '@/lib/posthog';


const TABS = [
  { id: 'requests', label: 'Requests', icon: ShieldAlert },
  { id: 'invite', label: 'Invite Clients', icon: UserPlus },
  { id: 'ocr', label: 'OCR Review Queue', icon: FileText }
];

const ACCESS_LEVELS = [
  { id: 'read', label: 'Read', color: 'sky' },
  { id: 'write', label: 'Write', color: 'emerald' },
  { id: 'update', label: 'Update', color: 'amber' }
];

export default function PlatformAdmin() {
  const { user, role: userRole } = useAuth();
  const queryClient = useQueryClient();

 // Tab State persisted in URL search params so it survives navigation
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'requests';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });

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
  const [inviteAccessLevels, setInviteAccessLevels] = useState({
    read: true,
    write: false,
    update: false
  });
  const [isInviteLinkDialogOpen, setIsInviteLinkDialogOpen] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");



  const [accountingSubTab, setAccountingSubTab] = useState('revenue');
  
  // Confirmation Dialog States
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState(null); // stores invitation id
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
        .select('id, email, role, organization_id, brand_id, location_id, token, accepted_at, expires_at, created_at')
        .eq('role', 'owner')
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
    
    const toastId = toast.loading("Generating secure onboarding link & sending email...");
    setInviting(true);
    try {
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { data: newInvite, error: insertErr } = await supabase
        .from("invitations")
        .insert([{
          email: inviteEmail,
          token,
          role: "owner",
          invited_by: user?.id,
          expires_at: expiresAt.toISOString(),
          organization_id: null,
          brand_id: null,
          location_id: null,
          metadata: { 
            modules: inviteSelectedModules,
            access: inviteAccessLevels 
          }
        }]).select().single();

      if (insertErr) throw insertErr;
      
      // Update cache instantly
      queryClient.setQueryData(['client-invites'], (old) => {
        if (!old) return [newInvite];
        if (old.some(i => i.id === newInvite.id)) return old;
        return [newInvite, ...old];
      });

      const link = `${window.location.origin}/signup/${token}`;

      // Send invitation email via EmailJS
      const emailResult = await sendInvitationEmail({
        to_email: inviteEmail,
        to_name: inviteEmail.split('@')[0],
        role: "Organization Owner",
        org_name: "Restops Platform",
        invite_link: link
      });

      setGeneratedInviteLink(link);
      setIsInviteLinkDialogOpen(true);

      // Emit Real-Time Domain Event for the architecture
      const { error: eventErr } = await supabase.rpc('log_frontend_event', {
        p_event_name: 'user.invitation.sent',
        p_entity_type: 'invitation',
        p_entity_id: null,
        p_payload: { email: inviteEmail, role: 'owner' }
      });
      if (eventErr) console.warn('Failed to emit domain event:', eventErr);

      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ['client-invites'] });

      if (!emailResult.success) {
        console.warn("Email sending failed or skipped:", emailResult.error);
        toast.success("Onboarding link generated, but email notification skipped.", { id: toastId });
      } else {
        toast.success("Onboarding link generated and invitation email sent!", { id: toastId });
      }
      posthog.capture('client_invited', { email: inviteEmail, role: 'owner' });
    } catch (e) {
      console.error('Invite generation failed:', e);
      toast.error(e.message || "Failed to generate invitation", { id: toastId });
    }
    setInviting(false);
  };

  const handleAcceptDemo = async (request) => {
    const toastId = toast.loading(`Accepting request from ${request.full_name} and generating onboarding link...`);
    setProcessingRequests(prev => { const n = new Set(prev); n.add(request.id); return n; });
    
    try {
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // 1. Create invitation
      const { data: newInvite, error: inviteErr } = await supabase
        .from("invitations")
        .insert([{
          email: request.email,
          token,
          role: "owner",
          invited_by: user?.id,
          expires_at: expiresAt.toISOString(),
          organization_id: null,
          brand_id: null,
          location_id: null,
          metadata: { 
            modules: ALL_MODULE_KEYS.filter(k => k !== 'platform'),
            access: { read: true, write: true, update: true },
            demo_request_id: request.id
          }
        }]).select().single();

      if (inviteErr) throw inviteErr;
      
      // Update cache instantly
      queryClient.setQueryData(['client-invites'], (old) => {
        if (!old) return [newInvite];
        if (old.some(i => i.id === newInvite.id)) return old;
        return [newInvite, ...old];
      });

      const signupLink = `${window.location.origin}/signup/${token}`;

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
        to_email: request.email,
        to_name: request.full_name,
        subject: "Your Restops Demo Request has been Approved!",
        message: `
Hi ${request.full_name},

We are thrilled to inform you that your request for a Restops system walkthrough and demo has been approved! 

We have generated a secure, personalized onboarding link so you can set up your organization owner account and explore the platform's advanced multi-tenant ecosystem.

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

      posthog.capture('demo_request_approved', { email: request.email });

      // Refresh queries
      queryClient.invalidateQueries({ queryKey: ['demo-requests'] });
      queryClient.invalidateQueries({ queryKey: ['client-invites'] });

      // Open the link dialog for the admin to see/copy too!
      setGeneratedInviteLink(signupLink);
      setIsInviteLinkDialogOpen(true);

    } catch (err) {
      console.error("Failed to accept demo request:", err);
      toast.error(err.message || "Failed to process request", { id: toastId });
    } finally {
      setProcessingRequests(prev => { const n = new Set(prev); n.delete(request.id); return n; });
    }
  };

  const handleRejectDemo = async (request) => {
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
    handleAcceptDemo(request);
  };

  const handleRequestReject = (request, type) => {
    if (type === 'contact') {
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
        // Find the invitation that was created for this demo request
        const { data: invite } = await supabase
          .from('invitations')
          .select('token')
          .eq('email', request.email)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const signupLink = invite?.token
          ? `${window.location.origin}/signup/${invite.token}`
          : `${window.location.origin}`;

        const emailResult = await sendEmail({
          to_email: request.email,
          to_name: request.full_name,
          subject: "Your Restops Demo Request has been Approved!",
          message: `
Hi ${request.full_name},

We are thrilled to inform you that your request for a Restops system walkthrough and demo has been approved! 

We have generated a secure, personalized onboarding link so you can set up your organization owner account and explore the platform's advanced multi-tenant ecosystem.

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
                <TableCell className="text-sm text-muted-foreground">{r.company_name || '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] capitalize bg-card">{r.plan || r.request_type || '—'}</Badge>
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
                <p className="text-muted-foreground text-sm">Generate secure onboarding links for Organization Owners</p>
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
                <TableHead className="text-[11px] font-bold">CREATED</TableHead>
                <TableHead className="text-[11px] font-bold">STATUS</TableHead>
                <TableHead className="text-[11px] font-bold">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingClientInvites.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No pending invitations</TableCell></TableRow>
              ) : pendingClientInvites.map(invite => (
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
                    </div>
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
                          const link = `${window.location.origin}/signup/${invite.token}`;
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
                          const link = `${window.location.origin}/signup/${invite.token}`;
                          const emailResult = await sendInvitationEmail({
                            to_email: invite.email,
                            to_name: invite.email.split('@')[0],
                            role: "Organization Owner",
                            org_name: "Restops Platform",
                            invite_link: link
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
              ))}
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
                <TableHead className="text-[11px] font-bold">CREATED</TableHead>
                <TableHead className="text-[11px] font-bold">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientHistoryInvites.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">No history available</TableCell></TableRow>
              ) : clientHistoryInvites.map(invite => {
                const isAccepted = !!invite.accepted_at;
                const hasProfile = allProfiles.some(profile => profile.email?.toLowerCase() === invite.email?.toLowerCase());
                const isExpired = new Date(invite.expires_at) <= new Date();
                
                let statusBadge;
                if (isAccepted || hasProfile) {
                  statusBadge = <Badge className="bg-emerald-100 text-emerald-700 text-[9px] font-bold border-none">Accepted</Badge>;
                } else if (isExpired) {
                  statusBadge = <Badge className="bg-slate-100 text-slate-700 text-[9px] font-bold border-none">Expired / Revoked</Badge>;
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
                    <TableCell className="text-[10px] text-muted-foreground opacity-70">{new Date(invite.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{statusBadge}</TableCell>
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
            <p className="text-sm text-muted-foreground mt-1">Global infrastructure & organization governance · v2.1.0</p>
          </div>
        </div>
        <div className="flex gap-3">
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
          { label: 'Platform MRR', value: `$${(plans.length ? 12450 : 0).toLocaleString()}`, sub: 'Estimated monthly', icon: DollarSign, color: 'emerald' },
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
                                  onClick={() => handleAcceptDemo(r)}
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
                            const count = orgs.filter(o => o.plan_id === plan.id).length;
                            return (
                              <div key={plan.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center font-bold text-muted-foreground">{plan.name[0]}</div>
                                   <div>
                                      <p className="font-bold text-sm">{plan.name}</p>
                                      <p className="text-[10px] text-muted-foreground">{count} Organizations</p>
                                   </div>
                                </div>
                                <p className="font-black text-foreground">${(count * plan.price_monthly).toLocaleString()}</p>
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
              await supabase.from('organizations').update({ enabled_modules: selectedModules }).eq('id', editingOrgModules.id);
              queryClient.invalidateQueries({ queryKey: ['organizations'] });
              toast.success("Modules updated");
              setEditingOrgModules(null);
            }}>Save Configuration</Button>
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

