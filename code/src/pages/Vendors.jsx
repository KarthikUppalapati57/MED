import React from 'react';
import { Routes, Route } from 'react-router-dom';
import VendorList from './vendors/VendorList';
import VendorDetail from './vendors/VendorDetail';

export default function VendorsRouter() {
  return (
    <Routes>
      <Route path="/" element={<VendorList />} />
      <Route path=":id" element={<VendorDetail />} />
    </Routes>
  );
}
