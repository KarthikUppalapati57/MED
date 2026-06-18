import React from 'react';
import { Routes, Route } from 'react-router-dom';

const VendorList = React.lazy(() => import('./vendors/VendorList'));
const VendorDetail = React.lazy(() => import('./vendors/VendorDetail'));

function VendorsRouteFallback() {
  return (
    <div className="flex min-h-72 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export default function VendorsRouter() {
  return (
    <React.Suspense fallback={<VendorsRouteFallback />}>
      <Routes>
        <Route path="/" element={<VendorList />} />
        <Route path=":id" element={<VendorDetail />} />
      </Routes>
    </React.Suspense>
  );
}
