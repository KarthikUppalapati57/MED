import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import OrgManagement from '../../src/pages/OrgManagement';
import { BrowserRouter } from 'react-router-dom';

// Mock the AuthContext
vi.mock('../../src/lib/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id' },
    userProfile: { role: 'platform_admin' },
    mfaLevel: 'aal1',
    mfaFactors: [],
    unenrollMFA: vi.fn(),
  }),
}));

// Mock react-query
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

// Mock the custom hooks
vi.mock('../../src/hooks/useAuthQuery', () => ({
  useAuthQuery: ({ queryKey }) => {
    if (queryKey[0] === 'my-organizations') {
      return { data: [{ id: '1', name: 'Test Org 1', status: 'active' }], isLoading: false };
    }
    if (queryKey[0] === 'my-brands') {
      return { data: [{ id: 'b1', organization_id: '1', name: 'Test Brand 1' }], isLoading: false };
    }
    if (queryKey[0] === 'my-locations') {
      return { data: [], isLoading: false };
    }
    if (queryKey[0] === 'org-profiles') {
      return { data: [], isLoading: false };
    }
    if (queryKey[0] === 'location-groups') {
      return { data: [], isLoading: false };
    }
    return { data: [], isLoading: false };
  },
}));

describe('OrgManagement Functional Testing', () => {
  it('renders the organization hierarchy correctly', async () => {
    render(
      <BrowserRouter>
        <OrgManagement />
      </BrowserRouter>
    );

    // Should display the page title
    expect(screen.getByText('Organization Management')).toBeInTheDocument();
    
    // Should display the mocked organization
    expect(screen.getByText('Test Org 1')).toBeInTheDocument();
  });
  
  it('has tabs for Hierarchy, Groups, and Security', () => {
    render(
      <BrowserRouter>
        <OrgManagement />
      </BrowserRouter>
    );
    
    expect(screen.getByText('Hierarchy')).toBeInTheDocument();
    expect(screen.getByText('Location Groups')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });
});
