const fs = require('fs');
const path = require('path');

// 1. Fix PlatformAuditLogs.jsx
const palFile = path.join(__dirname, 'src', 'pages', 'PlatformAuditLogs.jsx');
let pal = fs.readFileSync(palFile, 'utf8');

// Add useEffect import
pal = pal.replace(
  'import React, { useState } from "react";',
  'import React, { useState, useEffect } from "react";'
);

// Add realtime subscription after the searchQuery state
pal = pal.replace(
  "  const [selectedLog, setSelectedLog] = useState(null);\n\n  // ",
  `  const [selectedLog, setSelectedLog] = useState(null);

  // -- Realtime subscription for platform audit logs --
  useEffect(() => {
    const channel = supabase.channel('platform-audit-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform-audit-logs'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // `
);

fs.writeFileSync(palFile, pal, 'utf8');
console.log('PlatformAuditLogs.jsx updated');

// 2. Fix PlatformUserManagement.jsx
const pumFile = path.join(__dirname, 'src', 'pages', 'PlatformUserManagement.jsx');
let pum = fs.readFileSync(pumFile, 'utf8');

// Add useEffect import
pum = pum.replace(
  'import React, { useState } from "react";',
  'import React, { useState, useEffect } from "react";'
);

// Add realtime subscription after confirmDeleteAdmin state
pum = pum.replace(
  "  const [confirmDeleteAdmin, setConfirmDeleteAdmin] = useState(null);\n\n  // ",
  `  const [confirmDeleteAdmin, setConfirmDeleteAdmin] = useState(null);

  // -- Realtime subscription for platform users --
  useEffect(() => {
    const channel = supabase.channel('platform-users-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform-admin-invites'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // `
);

fs.writeFileSync(pumFile, pum, 'utf8');
console.log('PlatformUserManagement.jsx updated');

// 3. Fix OrgManagement.jsx
const omFile = path.join(__dirname, 'src', 'pages', 'OrgManagement.jsx');
let om = fs.readFileSync(omFile, 'utf8');

// Add useEffect import
om = om.replace(
  "import React, { useState } from 'react';",
  "import React, { useState, useEffect } from 'react';"
);

// Add realtime subscription after isLoading
om = om.replace(
  "  const isLoading = isLoadingOrgs || isLoadingBrands || isLoadingLocations;\n\n  const toggleOrg",
  `  const isLoading = isLoadingOrgs || isLoadingBrands || isLoadingLocations;

  // -- Realtime subscription for org management --
  useEffect(() => {
    const channel = supabase.channel('org-mgmt-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-brands'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-locations'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['org-profiles'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const toggleOrg`
);

fs.writeFileSync(omFile, om, 'utf8');
console.log('OrgManagement.jsx updated');
