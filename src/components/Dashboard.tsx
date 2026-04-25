import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, updateDoc, getDoc, collection, query, orderBy, limit, writeBatch, addDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { FarmState, AutomationSettings, SensorHistory, OperationType, handleFirestoreError, FarmControls, NotificationLog } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Thermometer, Droplets, Wind, Database, Power, Settings, LogOut, Cpu, Bell, History, BarChart3, Upload, Loader2, CheckCircle2, AlertTriangle, Printer, FileText, Sun, Sparkles, Utensils, Flame, Terminal } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { format, isValid } from 'date-fns';

const safeFormat = (dateStr: string | undefined | null, formatStr: string, fallback: string = 'Invalid Date') => {
  if (!dateStr) return fallback;
  const date = new Date(dateStr);
  if (!isValid(date)) return fallback;
  return format(date, formatStr);
};
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import Papa from 'papaparse';
import firebaseConfig from '../../firebase-applet-config.json';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const CONTROL_CONFIG = [
  { key: 'fan', label: 'Exhaust Fan', icon: Wind, color: 'text-blue-500' },
  { key: 'heater', label: 'Heater System', icon: Flame, color: 'text-orange-500' },
  { key: 'light', label: 'Farm Lighting', icon: Sun, color: 'text-yellow-500' },
  { key: 'cleaner', label: 'Manual Clean (Stool)', icon: Sparkles, color: 'text-purple-500' },
  { key: 'feed', label: 'Manual Feed', icon: Utensils, color: 'text-emerald-500' },
] as const;

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const [farmState, setFarmState] = useState<FarmState | null>(null);
  const [automation, setAutomation] = useState<AutomationSettings | null>(null);
  const [history, setHistory] = useState<SensorHistory[]>([]);
  const [notifHistory, setNotifHistory] = useState<NotificationLog[]>([]);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const lastNotifiedRef = useRef<{ [key: string]: number }>({});
  const lastControlsRef = useRef<FarmControls | null>(null);
  const [dailyAverages, setDailyAverages] = useState<any[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const farmId = "main-farm";

  useEffect(() => {
    if (user) {
      setIsAuthReady(true);
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

  // Simulated data generation removed to ensure only real data from ESP32 is shown.
  
  const toggleControl = async (key: keyof FarmControls) => {
    if (!farmState) return;
    
    // Restricted controls in Auto Mode
    if (farmState.autoMode) {
      addNotifLog("Restricted Action", "Manual controls are disabled while Auto Mode is active.", 'info');
      return;
    }

    try {
      const farmDoc = doc(db, 'farms', farmId);
      // Special logic for "Jog" buttons (Feed and Cleaner)
      // These are one-time triggers. The ESP32 will reset them once the task is complete.
      const isJogAction = key === 'feed' || key === 'cleaner';
      const newValue = !farmState.controls[key];

      await updateDoc(farmDoc, {
        [`controls.${key}`]: newValue
      });

      if (isJogAction && newValue) {
        addNotifLog(
          key === 'feed' ? "Feeding Initiated" : "Cleaning Initiated",
          `Device will perform the action and reset automatically.`,
          'status'
        );
      }
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

  const addNotifLog = (title: string, message: string, type: 'alert' | 'status' | 'info' = 'info') => {
    const newLog: NotificationLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      title,
      message,
      type
    };
    setNotifHistory(prev => [newLog, ...prev].slice(0, 50));
    
    if (notifPermission === 'granted') {
      new Notification(title, { body: message, icon: "/favicon.ico" });
    }
  };

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === 'granted') {
      addNotifLog("Notifications Enabled", "You will now receive real-time alerts.", "info");
    }
  };

  useEffect(() => {
    if (!farmState) return;

    // Detect control changes for notifications
    if (lastControlsRef.current) {
      const prev = lastControlsRef.current;
      const curr = farmState.controls;
      const timeStr = format(new Date(), 'hh:mm a');

      if (curr.feed && !prev.feed) addNotifLog("Feed Active", `Feeding system started at ${timeStr}`, 'status');
      if (!curr.feed && prev.feed) addNotifLog("Feed Stopped", `Feeding system finished at ${timeStr}`, 'status');
      
      if (curr.cleaner && !prev.cleaner) addNotifLog("Waste Cleaner Active", `Waste cleaner started at ${timeStr}`, 'status');
      if (!curr.cleaner && prev.cleaner) addNotifLog("Waste Cleaner Stopped", `Waste cleaner finished at ${timeStr}`, 'status');

      if (curr.fan && !prev.fan) addNotifLog("Fans Active", `Exhaust fans turned on at ${timeStr}`, 'status');
      if (!curr.fan && prev.fan) addNotifLog("Fans Stopped", `Exhaust fans turned off at ${timeStr}`, 'status');

      if (curr.heater && !prev.heater) addNotifLog("Heater Active", `Heating system turned on at ${timeStr}`, 'status');
      if (!curr.heater && prev.heater) addNotifLog("Heater Stopped", `Heating system turned off at ${timeStr}`, 'status');
    }
    lastControlsRef.current = farmState.controls;

    // Critical Alerts
    const now = Date.now();
    const cooldown = 5 * 60 * 1000;

    const checkAndNotify = (key: string, title: string, body: string, condition: boolean) => {
      if (condition) {
        const lastAlert = lastNotifiedRef.current[key] || 0;
        if (now - lastAlert > cooldown) {
          addNotifLog(title, body, 'alert');
          lastNotifiedRef.current[key] = now;
        }
      }
    };

    checkAndNotify('temp_high', '⚠️ High Temperature', `Temperature is ${farmState.temperature.toFixed(1)}°C!`, farmState.temperature > 27);
    checkAndNotify('temp_low', '❄️ Low Temperature', `Temperature is ${farmState.temperature.toFixed(1)}°C!`, farmState.temperature < 18);
    checkAndNotify('amm_high', '⚠️ Ammonia Alert', `Ammonia level critical: ${farmState.ammonia.toFixed(0)} AMM`, farmState.ammonia > 1500);

    const lowFeeds = [
      { id: 1, val: farmState.feedLevel },
      { id: 2, val: farmState.feedLevel2 },
      { id: 3, val: farmState.feedLevel3 }
    ].filter(f => f.val <= 10);

    if (lowFeeds.length > 0) {
      const ids = lowFeeds.map(f => f.id).join(', ');
      checkAndNotify('feed_low', '🥣 Low Feed Level', `Feeder(s) ${ids} are low!`, true);
    }
  }, [farmState]);

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
          <Button 
            variant={notifPermission === 'granted' ? "secondary" : "outline"} 
            size="sm" 
            className="rounded-full"
            onClick={requestNotifPermission}
          >
            <Bell className={`mr-2 h-4 w-4 ${notifPermission === 'granted' ? "fill-emerald-500 text-emerald-500" : ""}`} /> 
            {notifPermission === 'granted' ? "Notifications Active" : "Enable Notifications"}
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
          precision={0}
          icon={<Wind className="h-5 w-5" />} 
          status={
            farmState.ammonia > 1500 ? 'Critical' :
            farmState.ammonia >= 900 ? 'Warning' :
            'Optimal'
          }
        />
        <MultiFeedCard 
          farmState={farmState}
          feeds={[
            { id: 1, value: farmState.feedLevel },
            { id: 2, value: farmState.feedLevel2 },
            { id: 3, value: farmState.feedLevel3 },
          ]} 
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
                
                // Manual controls are disabled when Auto Mode is active.
                const isDisabled = farmState.autoMode;
                
                return (
                  <div key={key} className={`flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-all ${
                    isDisabled 
                      ? 'border-stone-100 bg-stone-50/50 opacity-60' 
                      : 'border-stone-200 bg-white hover:border-emerald-200 hover:shadow-md'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className={`rounded-lg bg-stone-50 p-2 ${config.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <Switch 
                        id={key} 
                        checked={value} 
                        onCheckedChange={() => toggleControl(key)} 
                        disabled={isDisabled}
                      />
                    </div>
                    <div>
                      <Label htmlFor={key} className={`text-sm font-bold ${isDisabled ? 'text-stone-400' : 'text-stone-700'}`}>{config.label}</Label>
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

      {/* System Notification Terminal - Moved to Bottom */}
      <div className="mt-8">
        <Card className="border-stone-800 bg-stone-950 text-stone-300 shadow-2xl overflow-hidden font-mono">
          <CardHeader className="border-b border-stone-800 bg-stone-900/50 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/50" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/50" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/50" />
                </div>
                <CardTitle className="text-sm font-bold text-stone-400">System Notification Terminal</CardTitle>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="border-stone-700 text-[10px] text-stone-500 uppercase tracking-widest">
                  {notifHistory.length} events logged
                </Badge>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-stone-600 hover:text-stone-300"
                  onClick={() => setNotifHistory([])}
                  title="Clear Logs"
                >
                  <History className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[400px] overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-stone-800">
              {notifHistory.length === 0 ? (
                <div className="flex h-full items-center justify-center text-stone-600 italic">
                  No system events logged yet...
                </div>
              ) : (
                notifHistory.map((log) => (
                  <div key={log.id} className="group flex gap-3 text-xs leading-relaxed border-l-2 border-transparent pl-2 hover:border-emerald-500/50 hover:bg-stone-900/50 transition-colors py-1">
                    <span className="shrink-0 text-stone-600">[{format(new Date(log.timestamp), 'HH:mm:ss')}]</span>
                    <div className="space-x-2">
                      <span className={`font-bold uppercase tracking-wider ${
                        log.type === 'alert' ? 'text-red-400' : 
                        log.type === 'status' ? 'text-emerald-400' : 
                        'text-blue-400'
                      }`}>
                        {log.title}:
                      </span>
                      <span className="text-stone-400">{log.message}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-stone-800 bg-stone-900/50 p-2 text-[10px] text-stone-600 flex justify-between">
              <span>SYSTEM READY // KERNEL v2.1.0</span>
              <span>AUTHENTICATED AS {user.email?.toUpperCase()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MultiFeedCard({ feeds, farmState }: { feeds: { id: number, value: number }[], farmState: FarmState }) {
  return (
    <Card className="border-stone-200 shadow-sm transition-all hover:shadow-md col-span-1 sm:col-span-2 lg:col-span-1">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="rounded-full bg-stone-100 p-2 text-stone-600"><Database className="h-5 w-5" /></div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Inventory Status</span>
        </div>
        <div className="mt-4 space-y-6">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-400">FEED LEVEL</p>
          
          {feeds.map((feed, idx) => {
            const status = feed.value <= 10 ? 'Critical' : feed.value <= 20 ? 'Warning' : 'Optimal';
            const statusColor = status === 'Optimal' ? 'text-green-600' : status === 'Warning' ? 'text-amber-600' : 'text-red-600';
            const rawDist = [farmState?.feedRaw1, farmState?.feedRaw2, farmState?.feedRaw3][idx];
            
            return (
              <div key={feed.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                  <span className="text-stone-500">Feeder {feed.id}</span>
                  <span className={statusColor}>{feed.value.toFixed(0)}% • {status}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(feed.value, 100)}%` }}
                    className={`h-full transition-all duration-500 ${statusColor.replace('text', 'bg')}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SensorCard({ title, value, unit, icon, status, precision = 2 }: { title: string; value: number; unit: string; icon: React.ReactNode; status: string; precision?: number }) {
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
            <span className={`text-3xl font-bold ${statusColor}`}>{value.toFixed(precision)}</span>
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
  const [selectedDay, setSelectedDay] = useState<string | null>(format(new Date(), 'yyyy-MM-dd'));
  const [reportDates, setReportDates] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const farmId = "main-farm";

  const toggleReportDate = (day: string) => {
    setReportDates(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handlePrint = () => {
    const datesToProcess = reportDates.length > 0 ? reportDates : (selectedDay ? [selectedDay] : []);
    
    if (datesToProcess.length === 0) {
      alert("Please select at least one date for the report.");
      return;
    }

    const doc = new jsPDF();
    let firstPage = true;

    // Header Helper
    const addHeader = (day?: string) => {
      doc.setFillColor(5, 150, 105);
      doc.rect(0, 0, 210, 35, 'F');
      doc.setTextColor(255);
      doc.setFontSize(20);
      doc.text('QuailSmart Batch Report', 14, 22);
      
      doc.setFontSize(10);
      doc.text(`Generated: ${safeFormat(new Date().toISOString(), 'PPpp')}`, 14, 30);
      if (day) {
        doc.text(`Record Date: ${safeFormat(day, 'MMMM dd, yyyy')}`, 140, 30);
      }
    };

    datesToProcess.sort().forEach((day) => {
      if (!dailyLogs[day]) return;

      if (!firstPage) doc.addPage();
      firstPage = false;

      addHeader(day);
      let currentY = 45;

      const logs = dailyLogs[day];
      const uniqueLogs = Array.from(new Map(logs.map(l => [l.timestamp, l])).values())
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (uniqueLogs.length > 0) {
        // Calculate Averages for the day
        const avgTemp = uniqueLogs.reduce((sum, l) => sum + l.temperature, 0) / uniqueLogs.length;
        const avgHum = uniqueLogs.reduce((sum, l) => sum + l.humidity, 0) / uniqueLogs.length;
        const avgAmm = uniqueLogs.reduce((sum, l) => sum + l.ammonia, 0) / uniqueLogs.length;

        doc.setFontSize(12);
        doc.setTextColor(30);
        doc.text(`Daily Stats for ${safeFormat(day, 'PP')}`, 14, currentY);
        currentY += 8;

        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.text(`Averages: Temp: ${avgTemp.toFixed(2)}°C | Hum: ${avgHum.toFixed(2)}% | Ammonia: ${avgAmm.toFixed(0)} AMM`, 14, currentY);
        currentY += 10;

        // Table
        autoTable(doc, {
          startY: currentY,
          head: [['Time', 'Temperature (°C)', 'Humidity (%)', 'Ammonia (AMM)']],
          body: uniqueLogs.map(log => [
            safeFormat(log.timestamp, 'hh:mm a'),
            log.temperature.toFixed(2),
            log.humidity.toFixed(2),
            log.ammonia.toFixed(0)
          ]),
          headStyles: { fillColor: [5, 150, 105], textColor: 255 },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          margin: { left: 14, right: 14 },
          theme: 'striped'
        });
      }
    });

    // Save the PDF
    const filename = datesToProcess.length === 1 
      ? `Farm_Report_${datesToProcess[0]}.pdf`
      : `Farm_Batch_Report_${datesToProcess.length}_days.pdf`;
    doc.save(filename);
  };

  // Group history by day for logs
  const dailyLogs = history.reduce((acc: { [key: string]: SensorHistory[] }, curr) => {
    const day = safeFormat(curr.timestamp, 'yyyy-MM-dd', 'Unknown');
    if (!acc[day]) acc[day] = [];
    acc[day].push(curr);
    return acc;
  }, {});

  const sortedDays = Object.keys(dailyLogs).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // Set initial selected day when data arrives
  useEffect(() => {
    if (sortedDays.length > 0 && !selectedDay) {
      setSelectedDay(sortedDays[0]);
    }
  }, [sortedDays, selectedDay]);

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
            <FileText className="h-6 w-6 text-emerald-600" /> Farm History Logs
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 no-print">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setReportDates(sortedDays)}
                className="text-[10px] uppercase font-bold border-stone-200"
              >
                Select All
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setReportDates([])}
                className="text-[10px] uppercase font-bold border-stone-200"
              >
                Clear
              </Button>
            </div>
            <Button 
              variant="default" 
              size="sm" 
              onClick={handlePrint}
              disabled={reportDates.length === 0 && !selectedDay}
              className="no-print bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm px-4"
            >
              <Printer className="mr-2 h-4 w-4" /> 
              {reportDates.length > 0 ? `Download Report (${reportDates.length} Days)` : 'Download Selected Day'}
            </Button>
          </div>
        </div>

        <div className="no-print bg-stone-50 border border-stone-100 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase text-stone-400 mb-3 tracking-widest">Select dates to include in your PDF report:</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {sortedDays.map(day => (
              <label 
                key={day} 
                className={`flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer transition-all ${
                  reportDates.includes(day) 
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                    : 'bg-white border-stone-200 text-stone-600 hover:border-emerald-300'
                }`}
              >
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={reportDates.includes(day)}
                  onChange={() => toggleReportDate(day)}
                />
                <span className={`text-[10px] font-bold ${reportDates.includes(day) ? 'text-emerald-100' : 'text-stone-400'}`}>
                  {safeFormat(day, 'MMM')}
                </span>
                <span className="text-sm font-bold">
                  {safeFormat(day, 'dd')}
                </span>
                <span className="text-[8px] opacity-80">
                  {safeFormat(day, 'yyyy')}
                </span>
              </label>
            ))}
          </div>
        </div>

        {sortedDays.length > 0 ? (
          <Tabs 
            value={selectedDay || sortedDays[0]} 
            onValueChange={setSelectedDay}
            className="w-full"
          >
            <div className="no-print overflow-x-auto pb-4 pt-4 border-t border-stone-100 mt-4">
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
                        <p className="text-2xl font-bold text-stone-800">{avgTemp.toFixed(2)}°C</p>
                      </div>
                      <div className="text-center space-y-1 border-stone-200 md:border-x">
                        <p className="text-[10px] font-bold uppercase text-emerald-600/70 tracking-widest">Humidity</p>
                        <p className="text-2xl font-bold text-stone-800">{avgHum.toFixed(2)}%</p>
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
