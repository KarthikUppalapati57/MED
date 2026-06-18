import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const currency = (value) => {
  const numeric = Number(value || 0);
  const formatted = Math.abs(numeric).toLocaleString(undefined, {
    minimumFractionDigits: Math.abs(numeric) < 1000 ? 2 : 0,
    maximumFractionDigits: Math.abs(numeric) < 1000 ? 2 : 0,
  });
  return `${numeric < 0 ? '-' : ''}$${formatted}`;
};

export function SpendPieChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} dataKey="value">
          {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
        </Pie>
        <Tooltip formatter={(value) => currency(value)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BenchmarkBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="actual" name="Actual" fill="#0d9488" radius={[4, 4, 0, 0]} />
        <Bar dataKey="benchmark" name="Benchmark" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
