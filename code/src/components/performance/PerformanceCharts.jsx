import React from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export function PerformanceTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dx={-10} tickFormatter={(val) => `$${val / 1000}k`} />
        <Tooltip
          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          formatter={(value) => [`$${value}`, 'Sales']}
        />
        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
        <Area type="monotone" dataKey="actual" name="Actual Sales" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorActual)" />
        <Area type="monotone" dataKey="budget" name="Budget" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" fill="none" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PerformanceCategoryPieChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={5}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Spend']} />
        <Legend layout="vertical" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 12, paddingTop: 20 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SalesDayOfWeekBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dx={-10} tickFormatter={(val) => `$${val / 1000}k`} />
        <Tooltip
          cursor={{ fill: 'transparent' }}
          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          formatter={(value) => [`$${value.toFixed(2)}`, 'Avg Sales']}
        />
        <Bar dataKey="avgSales" fill="#8884d8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SalesForecastAreaChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(val) => `$${val / 1000}k`} />
        <Tooltip
          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          formatter={(value) => [`$${value.toFixed(2)}`, 'Sales']}
        />
        <Area type="monotone" dataKey="actual" name="Actual" stroke="#3b82f6" strokeWidth={3} fillOpacity={0} />
        <Area type="monotone" dataKey="forecast" name="Forecast" stroke="#a855f7" strokeWidth={3} strokeDasharray="5 5" fill="url(#colorForecast)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function VarianceWaterfallChart({ data }) {
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded shadow-md text-sm">
          <p className="font-semibold mb-1">{item.category}</p>
          <p className={`font-bold ${item.value > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            ${Math.abs(item.value).toFixed(2)} {item.value > 0 ? 'Favorable' : 'Unfavorable'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{item.desc}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
        <XAxis type="number" tickFormatter={(val) => `$${val}`} />
        <YAxis dataKey="category" type="category" width={120} tick={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
