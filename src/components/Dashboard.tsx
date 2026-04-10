import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, getDoc, collection, query, orderBy, limit, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { FarmState, AutomationSettings, SensorHistory, OperationType, handleFirestoreError, FarmControls } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Thermometer, Droplets, Wind, Database, Power, Settings, LogOut, Cpu, Bell, History, BarChart3, Upload, Loader2, CheckCircle2, AlertTriangle, Printer, FileText, Sun, Sparkles, Utensils, Flame } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { format, isValid } from 'date-fns';

const safeFormat = (dateStr: string | undefined | null, formatStr: string, fallback: string = 'Invalid Date') => {
  if (!dateStr) return fallback;
  const date = new Date(dateStr);
  if (!isValid(date)) return fallback;
  return format(date, formatStr);
};
import { motion, AnimatePresence } from 'motion/react';
import { seedFarmData, generateSimulatedHistory, clearHistory } from '../seed';
import { User } from 'firebase/auth';
import Papa from 'papaparse';
import firebaseConfig from '../../firebase-applet-config.json';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const CONTROL_CONFIG = [
  { key: 'fan', label: 'Exhaust Fan', icon: Wind, color: 'text-blue-500' },
  { key: 'heater', label: 'Heater System', icon: Flame, color: 'text-orange-500' },
  { key: 'light', label: 'Farm Lighting', icon: Sun, color: 'text-yellow-500' },
  { key: 'cleaner', label: 'Waste Cleaner', icon: Sparkles, color: 'text-purple-500' },
  { key: 'feed', label: 'Auto Feeder', icon: Utensils, color: 'text-emerald-500' },
] as const;

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [farmState, setFarmState] = useState<FarmState | null>(null);
  const [automation, setAutomation] = useState<AutomationSettings | null>(null);
  const [history, setHistory] = useState<SensorHistory[]>([]);
  const [dailyAverages, setDailyAverages] = useState<any[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const farmId = "main-farm";

  useEffect(() => {
    if (user) {
      setIsAuthReady(true);
      // Check if we need to seed
      getDoc(doc(db, 'farms', farmId)).then(snap => {
        if (!snap.exists()) {
          seedFarmData();
        }
      });
    }
  }, [user]);

  useEffect(() => {
    if (!isAuthReady) return;

    const farmDoc = doc(db, 'farms', farmId);
    const unsubFarm = onSnapshot(farmDoc, (snapshot) => {
      if (snapshot.exists()) {
        setFarmState(snapshot.data() as FarmState);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `farms/${farmId}`));

    const settingsDoc = doc(db, 'farms', farmId, 'settings', 'automation');
    const unsubSettings = onSnapshot(settingsDoc, (snapshot) => {
      if (snapshot.exists()) {
        setAutomation(snapshot.data() as AutomationSettings);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `farms/${farmId}/settings/automation`));

    // Hourly History (Last 24 hours)
    const historyQuery = query(
      collection(db, 'farms', farmId, 'history'),
      orderBy('timestamp', 'desc'),
      limit(5000)
    );
    const unsubHistory = onSnapshot(historyQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SensorHistory));
      const sortedData = data.reverse();
      setHistory(sortedData);

      // Calculate Daily Averages from the history data
      const days: { [key: string]: any[] } = {};
      sortedData.forEach(entry => {
        const day = safeFormat(entry.timestamp, 'yyyy-MM-dd', 'Unknown');
        if (!days[day]) days[day] = [];
        days[day].push(entry);
      });

      const averages = Object.entries(days).map(([day, entries]) => ({
        date: day,
        temperature: entries.reduce((acc, curr) => acc + curr.temperature, 0) / entries.length,
        humidity: entries.reduce((acc, curr) => acc + curr.humidity, 0) / entries.length,
        ammonia: entries.reduce((acc, curr) => acc + curr.ammonia, 0) / entries.length,
      }));
      setDailyAverages(averages);
    }, (error) => handleFirestoreError(error, OperationType.GET, `farms/${farmId}/history`));

    return () => {
      unsubFarm();
      unsubSettings();
      unsubHistory();
    };
  }, [isAuthReady]);

  useEffect(() => {
    if (isAuthReady) {
      const hasOldestData = history.some(h => h.timestamp.startsWith('2026-03-30'));
      // If we don't have the oldest data, we should probably seed.
      // We'll remove the length check to be more aggressive for now.
      if (!hasOldestData) {
        generateSimulatedHistory(farmId);
      }
    }
  }, [history.length, isAuthReady, farmId]);

  const toggleControl = async (key: keyof FarmState['controls']) => {
    if (!farmState) return;
    try {
      const farmDoc = doc(db, 'farms', farmId);
      await updateDoc(farmDoc, {
        [`controls.${key}`]: !farmState.controls[key]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}`);
    }
  };

  const toggleAutoMode = async () => {
    if (!farmState) return;
    try {
      const farmDoc = doc(db, 'farms', farmId);
      await updateDoc(farmDoc, {
        autoMode: !farmState.autoMode
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}`);
    }
  };

  const updateSettings = async (newSettings: Partial<AutomationSettings>) => {
    try {
      const settingsDoc = doc(db, 'farms', farmId, 'settings', 'automation');
      await updateDoc(settingsDoc, newSettings);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `farms/${farmId}/settings/automation`);
    }
  };

  if (!farmState) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <Cpu className="mx-auto h-12 w-12 animate-pulse text-stone-400" />
          <h2 className="mt-4 text-xl font-semibold text-stone-600">Connecting to Farm Controller...</h2>
          <p className="text-stone-400">Waiting for real-time data from ESP32</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Backyard Quail Farm</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={farmState.lastUpdate ? "outline" : "destructive"} className="bg-white">
              {farmState.lastUpdate ? '● ONLINE' : '● OFFLINE / ERROR'}
            </Badge>
            <span className="text-xs text-stone-500">
              Last Update: {safeFormat(farmState.lastUpdate, 'PPpp', 'Never')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm border border-stone-200">
            <Label htmlFor="auto-mode" className="text-xs font-bold uppercase tracking-wider text-stone-500">Auto Mode</Label>
            <Switch id="auto-mode" checked={farmState.autoMode} onCheckedChange={toggleAutoMode} />
          </div>
          <Button variant="outline" size="sm" className="rounded-full">
            <Bell className="mr-2 h-4 w-4" /> Enable Notifications
          </Button>
          <div className="flex items-center gap-3 border-l pl-4 border-stone-200">
            <div className="text-right">
              <p className="text-xs font-bold text-stone-900">{user.displayName || 'User'}</p>
              <button onClick={onLogout} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-600">Logout</button>
            </div>
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="h-10 w-10 rounded-full border-2 border-white shadow-sm" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-stone-200 text-xs font-bold text-stone-500 shadow-sm">
                {user.displayName?.charAt(0) || 'U'}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SensorCard 
          title="Temperature" 
          value={farmState.temperature} 
          unit="°C" 
          icon={<Thermometer className="h-5 w-5" />} 
          status={
            farmState.temperature < 18 || farmState.temperature > 27 ? 'Critical' :
            (farmState.temperature >= 18 && farmState.temperature < 21) || (farmState.temperature > 24 && farmState.temperature <= 27) ? 'Warning' :
            'Optimal'
          }
        />
        <SensorCard 
          title="Humidity" 
          value={farmState.humidity} 
          unit="%" 
          icon={<Droplets className="h-5 w-5" />} 
          status={
            farmState.humidity < 35 || farmState.humidity > 75 ? 'Critical' :
            (farmState.humidity >= 35 && farmState.humidity < 40) || (farmState.humidity > 70 && farmState.humidity <= 75) ? 'Warning' :
            'Optimal'
          }
        />
        <SensorCard 
          title="Ammonia (AMM)" 
          value={farmState.ammonia} 
          unit="" 
          icon={<Wind className="h-5 w-5" />} 
          status={
            farmState.ammonia > 1500 ? 'Critical' :
            farmState.ammonia >= 900 ? 'Warning' :
            'Optimal'
          }
        />
        <SensorCard 
          title="Feed Level" 
          value={farmState.feedLevel} 
          unit="%" 
          icon={<Database className="h-5 w-5" />} 
          status={
            farmState.feedLevel < 10 ? 'Critical' :
            farmState.feedLevel <= 20 ? 'Warning' :
            'Optimal'
          }
        />
      </div>

      {/* Reference Legends */}
      <Card className="border-stone-200 shadow-sm bg-stone-50/30">
        <CardHeader className="py-3 border-b border-stone-100">
          <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Reference Legends
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Temp Legend */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Temperature</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Optimal: 21°C – 24°C
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> Warning: 18°C–21°C or 24°C–27°C
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-red-600">
                  <Bell className="h-3.5 w-3.5 fill-red-100" /> Critical: Below 18°C or Above 27°C
                </div>
              </div>
            </div>

            {/* Humidity Legend */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Humidity</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Optimal: 40% – 70%
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> Warning: 35% – 40% or 70% – 75%
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-red-600">
                  <Bell className="h-3.5 w-3.5 fill-red-100" /> Critical: Below 35% or Above 75%
                </div>
              </div>
            </div>

            {/* Ammonia Legend */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Ammonia (AMM)</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Optimal: Below 900 AMM
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> Warning: 900 – 1500 AMM
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-red-600">
                  <Bell className="h-3.5 w-3.5 fill-red-100" /> Critical: Above 1500 AMM
                </div>
              </div>
            </div>

            {/* Feed Legend */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Feed Level</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Optimal: Above 20%
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> Warning: 10% – 20%
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-red-600">
                  <Bell className="h-3.5 w-3.5 fill-red-100" /> Critical: Below 10%
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controls & Settings */}
      <Tabs defaultValue="controls" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-stone-100 p-1">
          <TabsTrigger value="controls" className="data-[state=active]:bg-white"><Power className="mr-2 h-4 w-4" /> Manual</TabsTrigger>
          <TabsTrigger value="automation" className="data-[state=active]:bg-white"><Settings className="mr-2 h-4 w-4" /> Automation</TabsTrigger>
        </TabsList>
        
        <TabsContent value="controls" className="mt-6">
          <Card className="border-stone-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Manual Controls</CardTitle>
              <CardDescription>Directly toggle farm equipment. Disabled when Auto Mode is active.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {CONTROL_CONFIG.map((config) => {
                const key = config.key as keyof FarmControls;
                const value = farmState.controls[key];
                const Icon = config.icon;
                
                return (
                  <div key={key} className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-all hover:border-emerald-200 hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <div className={`rounded-lg bg-stone-50 p-2 ${config.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <Switch 
                        id={key} 
                        checked={value} 
                        onCheckedChange={() => toggleControl(key)} 
                        disabled={farmState.autoMode}
                      />
                    </div>
                    <div>
                      <Label htmlFor={key} className="text-sm font-bold text-stone-700">{config.label}</Label>
                      <p className="text-[10px] text-stone-400 uppercase tracking-wider font-medium">
                        {value ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="mt-6">
          <div className="grid gap-6 md:grid-cols-3">
            <AutomationCard 
              title="Feed Schedule" 
              settings={automation?.feedSchedule} 
              onSave={(s) => updateSettings({ feedSchedule: s })} 
            />
            <AutomationCard 
              title="Cleaner Schedule" 
              settings={automation?.cleanerSchedule} 
              onSave={(s) => updateSettings({ cleanerSchedule: s })} 
            />
            <AutomationCard 
              title="Light Schedule" 
              settings={automation?.lightSchedule} 
              isRange 
              onSave={(s) => updateSettings({ lightSchedule: s })} 
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Farm History Section */}
      <FarmHistory history={history} />
    </div>
  );
}

function SensorCard({ title, value, unit, icon, status }: { title: string; value: number; unit: string; icon: React.ReactNode; status: string }) {
  const statusColor = status === 'Optimal' ? 'text-green-600' : status === 'Warning' ? 'text-amber-600' : 'text-red-600';
  return (
    <Card className="border-stone-200 shadow-sm transition-all hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="rounded-full bg-stone-100 p-2 text-stone-600">{icon}</div>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${statusColor}`}>Status: {status}</span>
        </div>
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-bold ${statusColor}`}>{value}</span>
            <span className="text-lg font-medium text-stone-500">{unit}</span>
          </div>
        </div>
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-stone-100">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(value, 100)}%` }}
            className={`h-full ${statusColor.replace('text', 'bg')}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function AutomationCard({ title, settings, isRange, onSave }: { title: string; settings: any; isRange?: boolean; onSave: (s: any) => void }) {
  const [local, setLocal] = useState(settings || {});

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-stone-500">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isRange ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase">Start</Label>
              <input 
                type="time" 
                className="w-full rounded-md border border-stone-200 p-2 text-sm" 
                value={local.start || ''} 
                onChange={e => setLocal({...local, start: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase">End</Label>
              <input 
                type="time" 
                className="w-full rounded-md border border-stone-200 p-2 text-sm" 
                value={local.end || ''} 
                onChange={e => setLocal({...local, end: e.target.value})}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase">Time</Label>
              <input 
                type="time" 
                className="w-full rounded-md border border-stone-200 p-2 text-sm" 
                value={local.time || ''} 
                onChange={e => setLocal({...local, time: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase">Duration (sec)</Label>
              <input 
                type="number" 
                className="w-full rounded-md border border-stone-200 p-2 text-sm" 
                value={local.duration || 0} 
                onChange={e => setLocal({...local, duration: parseInt(e.target.value)})}
              />
            </div>
          </div>
        )}
        <Button size="sm" className="w-full bg-stone-900" onClick={() => onSave(local)}>Save Settings to Farm</Button>
      </CardContent>
    </Card>
  );
}

function FarmHistory({ history }: { history: SensorHistory[] }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const farmId = "main-farm";

  const handlePrint = () => {
    const doc = new jsPDF();
    
    // Add Title
    doc.setFontSize(20);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text('Backyard Quail Farm - Sensor Report', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${safeFormat(new Date().toISOString(), 'PPpp')}`, 14, 30);
    
    let currentY = 40;

    // Sort days to print chronologically
    const daysToPrint = [...sortedDays].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    daysToPrint.forEach((day, index) => {
      const logs = dailyLogs[day];
      const uniqueLogs = Array.from(new Map(logs.map(l => [l.timestamp, l])).values())
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (uniqueLogs.length === 0) return;

      // Add a new page if not the first day
      if (index > 0) {
        doc.addPage();
        currentY = 20;
      }

      // Day Header
      doc.setFontSize(14);
      doc.setTextColor(30);
      doc.text(`Date: ${safeFormat(day, 'MMMM dd, yyyy')}`, 14, currentY);
      currentY += 10;

      // Calculate Averages for the day
      const avgTemp = uniqueLogs.reduce((sum, l) => sum + l.temperature, 0) / uniqueLogs.length;
      const avgHum = uniqueLogs.reduce((sum, l) => sum + l.humidity, 0) / uniqueLogs.length;
      const avgAmm = uniqueLogs.reduce((sum, l) => sum + l.ammonia, 0) / uniqueLogs.length;

      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text(`Daily Averages: Temp: ${avgTemp.toFixed(1)}°C | Hum: ${avgHum.toFixed(1)}% | Ammonia: ${avgAmm.toFixed(0)} AMM`, 14, currentY);
      currentY += 10;

      // Table
      autoTable(doc, {
        startY: currentY,
        head: [['Time', 'Temperature (°C)', 'Humidity (%)', 'Ammonia (AMM)']],
        body: uniqueLogs.map(log => [
          safeFormat(log.timestamp, 'hh:mm a'),
          log.temperature.toFixed(1),
          log.humidity.toFixed(1),
          log.ammonia.toFixed(0)
        ]),
        headStyles: { fillColor: [5, 150, 105], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { left: 14, right: 14 },
        theme: 'striped'
      });

      // Update currentY for next day if needed (though we add page)
      // @ts-ignore
      currentY = doc.lastAutoTable.finalY + 20;
    });

    // Save the PDF
    doc.save(`Farm_Report_${safeFormat(new Date().toISOString(), 'yyyy-MM-dd')}.pdf`);
  };

  // Group history by day for logs
  const dailyLogs = history.reduce((acc: { [key: string]: SensorHistory[] }, curr) => {
    const day = safeFormat(curr.timestamp, 'yyyy-MM-dd', 'Unknown');
    if (!acc[day]) acc[day] = [];
    acc[day].push(curr);
    return acc;
  }, {});

  const sortedDays = Object.keys(dailyLogs).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const handleResetAndSync = async () => {
    setIsSyncing(true);
    try {
      // Clear duplicates in multiple passes to handle large amounts
      await clearHistory(farmId);
      await clearHistory(farmId);
      await clearHistory(farmId);
      // Then seed with deterministic IDs
      await generateSimulatedHistory(farmId);
      alert("Data reset and synced successfully! If some dates are still missing, try clicking 'Reset & Sync' one more time.");
    } catch (error) {
      console.error("Sync error:", error);
      alert("There was an error syncing data. Please check your connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 print:m-0 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .tabs-content { display: block !important; }
        }
      `}} />
      
      <div className="print-section space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2 text-stone-800">
            <FileText className="h-6 w-6 text-emerald-600" /> Farm Sensor History
          </h2>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={isSyncing}
              onClick={handleResetAndSync}
              className="no-print text-red-600 border-red-200 hover:bg-red-50"
            >
              {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />}
              Reset & Sync
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => generateSimulatedHistory(farmId)}
              className="no-print text-emerald-600 border-emerald-200 hover:bg-emerald-50"
            >
              <Upload className="mr-2 h-4 w-4" /> Quick Sync
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handlePrint}
              className="no-print text-stone-500 hover:text-emerald-600"
            >
              <Printer className="mr-2 h-4 w-4" /> Print Report
            </Button>
          </div>
        </div>

        {sortedDays.length > 0 ? (
          <Tabs defaultValue={sortedDays[0]} className="w-full">
            <div className="no-print overflow-x-auto pb-4">
              <TabsList className="flex h-auto w-max gap-2 bg-transparent p-0">
                {sortedDays.map(day => (
                  <TabsTrigger 
                    key={day} 
                    value={day} 
                    className="rounded-full border border-stone-200 px-4 py-1.5 text-xs font-medium text-stone-500 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                  >
                    {safeFormat(day, 'M/d/yyyy')}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {sortedDays.map(day => {
              const logs = dailyLogs[day];
              const uniqueLogs = Array.from(new Map(logs.map(l => [l.timestamp, l])).values())
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

              const avgTemp = uniqueLogs.reduce((sum, l) => sum + l.temperature, 0) / uniqueLogs.length;
              const avgHum = uniqueLogs.reduce((sum, l) => sum + l.humidity, 0) / uniqueLogs.length;
              const avgAmm = uniqueLogs.reduce((sum, l) => sum + l.ammonia, 0) / uniqueLogs.length;

              // Chart data sorted chronologically
              const chartData = [...uniqueLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                .map(l => ({
                  time: safeFormat(l.timestamp, 'hh:mm a'),
                  temperature: l.temperature,
                  humidity: l.humidity,
                  ammonia: l.ammonia
                }));

              return (
                <TabsContent key={day} value={day} className="mt-0 tabs-content space-y-8">
                  {/* Daily Performance Average Section */}
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="rounded-lg bg-emerald-600 p-2 text-white">
                        <BarChart3 className="h-5 w-5" />
                      </div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-900">Daily Performance Average</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      <div className="text-center space-y-1">
                        <p className="text-[10px] font-bold uppercase text-emerald-600/70 tracking-widest">Temperature</p>
                        <p className="text-2xl font-bold text-stone-800">{avgTemp.toFixed(1)}°C</p>
                      </div>
                      <div className="text-center space-y-1 border-stone-200 md:border-x">
                        <p className="text-[10px] font-bold uppercase text-emerald-600/70 tracking-widest">Humidity</p>
                        <p className="text-2xl font-bold text-stone-800">{avgHum.toFixed(1)}%</p>
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-[10px] font-bold uppercase text-emerald-600/70 tracking-widest">Ammonia Level (AMM)</p>
                        <p className="text-2xl font-bold text-stone-800">{avgAmm.toFixed(0)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Hourly Sensor Trends Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
                    {/* Temperature Trend */}
                    <Card className="border-stone-200 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-2">
                          <Thermometer className="h-4 w-4 text-red-500" /> Temperature Trend (°C)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="h-[200px] pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis 
                              dataKey="time" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false} 
                              interval="preserveStartEnd"
                              minTickGap={30}
                            />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                              labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="temperature" 
                              stroke="#ef4444" 
                              strokeWidth={3} 
                              dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                              activeDot={{ r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Humidity Trend */}
                    <Card className="border-stone-200 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-2">
                          <Droplets className="h-4 w-4 text-blue-500" /> Humidity Trend (%)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="h-[200px] pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis 
                              dataKey="time" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false} 
                              interval="preserveStartEnd"
                              minTickGap={30}
                            />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                              labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="humidity" 
                              stroke="#3b82f6" 
                              strokeWidth={3} 
                              dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                              activeDot={{ r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Ammonia Trend */}
                    <Card className="border-stone-200 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-2">
                          <Wind className="h-4 w-4 text-amber-500" /> Ammonia Trend (AMM)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="h-[200px] pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis 
                              dataKey="time" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false} 
                              interval="preserveStartEnd"
                              minTickGap={30}
                            />
                            <YAxis fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                              labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="ammonia" 
                              stroke="#f59e0b" 
                              strokeWidth={3} 
                              dot={{ r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }}
                              activeDot={{ r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detailed Logs Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-widest text-stone-400 border-b border-stone-100">
                          <th className="px-4 py-4">Time</th>
                          <th className="px-4 py-4">Temperature</th>
                          <th className="px-4 py-4">Humidity</th>
                          <th className="px-4 py-4">Ammonia Level (AMM)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {uniqueLogs.map((log, idx) => (
                          <tr key={idx} className="group hover:bg-stone-50/50 transition-colors">
                            <td className="px-4 py-4 text-stone-500 font-medium">{safeFormat(log.timestamp, 'hh:mm a')}</td>
                            <td className="px-4 py-4 text-stone-800 font-semibold">{log.temperature.toFixed(1)}°C</td>
                            <td className="px-4 py-4 text-stone-800 font-semibold">{log.humidity.toFixed(1)}%</td>
                            <td className="px-4 py-4 text-stone-800 font-semibold">{log.ammonia.toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        ) : (
          <div className="py-20 text-center rounded-xl border border-dashed border-stone-200">
            <Database className="mx-auto h-12 w-12 text-stone-200" />
            <p className="mt-4 text-stone-400 font-medium">No historical logs found for this farm.</p>
          </div>
        )}
      </div>
    </div>
  );
}
