import { db } from './firebase';
import { doc, setDoc, collection, writeBatch, getDocs, query, limit } from 'firebase/firestore';

export async function clearHistory(farmId: string) {
  const historyRef = collection(db, 'farms', farmId, 'history');
  // Delete in batches of 500 (Firestore limit)
  const q = query(historyRef, limit(500));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return 0;

  const batch = writeBatch(db);
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  return snapshot.size;
}

export async function seedFarmData() {
  const farmId = "main-farm";
  
  // 1. Initial State
  await setDoc(doc(db, 'farms', farmId), {
    temperature: 28.5,
    humidity: 60,
    ammonia: 150,
    feedLevel: 0,
    feedLevel2: 0,
    feedLevel3: 50,
    lastUpdate: new Date().toISOString(),
    autoMode: true,
    controls: {
      fan: false,
      heater: false,
      light: true,
      cleaner: false,
      feed: false
    }
  });

  // 2. Initial Settings
  await setDoc(doc(db, 'farms', farmId, 'settings', 'automation'), {
    feedSchedule: { time: "07:00", duration: 30 },
    cleanerSchedule: { time: "08:00", duration: 60 },
    lightSchedule: { start: "18:00", end: "06:00" }
  });

  // 3. Generate History
  await generateSimulatedHistory(farmId);
}

export async function generateSimulatedHistory(farmId: string) {
  const historyRef = collection(db, 'farms', farmId, 'history');
  const batch = writeBatch(db);
  
  // Data provided by user - Cleaned of duplicates and expanded
  const historicalData = [
    { date: '2026-04-10', logs: [{ time: '00:02', t: 29.0, h: 71.0, a: 139.0 }] },
    { 
      date: '2026-04-09', 
      logs: [
        { time: '23:00', t: 29.0, h: 71.0, a: 139.0 },
        { time: '22:00', t: 29.0, h: 71.0, a: 139.0 },
        { time: '21:00', t: 29.0, h: 71.0, a: 139.0 },
        { time: '20:00', t: 29.0, h: 71.0, a: 139.0 },
        { time: '19:00', t: 29.0, h: 71.0, a: 139.0 },
        { time: '18:00', t: 29.0, h: 71.0, a: 139.0 },
        { time: '17:00', t: 29.0, h: 71.0, a: 139.0 },
        { time: '15:17', t: 29.0, h: 71.0, a: 139.0 },
        { time: '03:00', t: 25.0, h: 89.0, a: 138.0 },
        { time: '02:11', t: 24.0, h: 85.0, a: 128.0 },
        { time: '02:10', t: 24.0, h: 85.0, a: 118.0 },
        { time: '01:31', t: 25.0, h: 81.0, a: 97.0 },
        { time: '00:34', t: 26.0, h: 80.0, a: 144.0 },
        { time: '00:32', t: 26.0, h: 80.0, a: 128.0 },
        { time: '00:31', t: 26.0, h: 81.0, a: 122.0 },
      ]
    },
    {
      date: '2026-04-08',
      logs: [
        { time: '20:59', t: 29.0, h: 71.0, a: 139.0 },
        { time: '19:00', t: 30.0, h: 76.0, a: 144.0 },
        { time: '18:40', t: 31.0, h: 73.0, a: 124.0 },
        { time: '18:00', t: 32.0, h: 65.0, a: 100.0 },
        { time: '17:00', t: 37.0, h: 46.0, a: 103.0 },
        { time: '16:23', t: 37.0, h: 49.0, a: 140.0 },
        { time: '16:00', t: 38.0, h: 47.0, a: 176.0 },
        { time: '15:57', t: 38.0, h: 47.0, a: 171.0 },
        { time: '15:00', t: 38.0, h: 47.0, a: 135.0 },
        { time: '14:33', t: 37.0, h: 47.0, a: 171.0 },
      ]
    },
    {
      date: '2026-04-06',
      logs: [
        { time: '04:00', t: 21.9, h: 45.7, a: 307.0 },
        { time: '03:00', t: 24.4, h: 50.3, a: 306.0 },
        { time: '02:00', t: 24.0, h: 59.6, a: 630.0 },
        { time: '01:00', t: 22.9, h: 63.2, a: 648.0 },
        { time: '00:00', t: 22.8, h: 57.9, a: 572.0 },
      ]
    },
    {
      date: '2026-04-05',
      logs: [
        { time: '23:00', t: 21.6, h: 63.7, a: 640.0 },
        { time: '22:00', t: 21.6, h: 49.6, a: 748.0 },
        { time: '21:00', t: 23.0, h: 61.5, a: 537.0 },
        { time: '20:00', t: 22.6, h: 45.1, a: 350.0 },
        { time: '19:00', t: 23.0, h: 61.5, a: 537.0 },
        { time: '18:00', t: 22.6, h: 45.1, a: 350.0 },
        { time: '17:00', t: 24.3, h: 49.4, a: 350.0 },
        { time: '16:00', t: 21.3, h: 50.4, a: 499.0 },
        { time: '15:00', t: 21.1, h: 63.0, a: 676.0 },
        { time: '14:00', t: 22.5, h: 60.6, a: 456.0 },
        { time: '13:00', t: 21.3, h: 57.0, a: 292.0 },
        { time: '12:00', t: 24.4, h: 64.4, a: 382.0 },
        { time: '11:00', t: 24.9, h: 47.2, a: 587.0 },
        { time: '10:00', t: 23.0, h: 49.0, a: 756.0 },
        { time: '09:00', t: 23.6, h: 59.6, a: 272.0 },
        { time: '08:00', t: 24.5, h: 59.2, a: 433.0 },
        { time: '07:00', t: 23.1, h: 46.1, a: 493.0 },
        { time: '06:00', t: 22.3, h: 60.0, a: 700.0 },
        { time: '05:00', t: 21.1, h: 46.2, a: 236.0 },
        { time: '04:00', t: 23.3, h: 46.6, a: 711.0 },
        { time: '03:00', t: 22.5, h: 47.4, a: 453.0 },
        { time: '02:00', t: 23.4, h: 53.9, a: 447.0 },
        { time: '01:00', t: 24.9, h: 55.9, a: 781.0 },
        { time: '00:00', t: 24.4, h: 55.5, a: 460.0 },
      ]
    },
    {
      date: '2026-04-04',
      logs: [
        { time: '23:00', t: 25.0, h: 58.0, a: 42.0 },
        { time: '22:00', t: 24.1, h: 60.7, a: 650.0 },
        { time: '21:00', t: 24.5, h: 49.3, a: 322.0 },
        { time: '20:00', t: 23.3, h: 50.9, a: 574.0 },
        { time: '19:00', t: 22.8, h: 55.6, a: 283.0 },
        { time: '18:00', t: 23.5, h: 53.1, a: 723.0 },
        { time: '17:00', t: 23.4, h: 54.2, a: 244.0 },
        { time: '16:00', t: 21.5, h: 56.5, a: 377.0 },
        { time: '15:00', t: 24.4, h: 46.9, a: 214.0 },
        { time: '14:00', t: 22.1, h: 63.4, a: 338.0 },
        { time: '13:00', t: 22.9, h: 62.3, a: 346.0 },
        { time: '12:00', t: 24.5, h: 58.1, a: 225.0 },
        { time: '11:00', t: 22.6, h: 55.8, a: 406.0 },
        { time: '10:00', t: 24.0, h: 52.0, a: 674.0 },
        { time: '09:00', t: 21.2, h: 50.7, a: 777.0 },
        { time: '08:00', t: 22.0, h: 63.9, a: 464.0 },
        { time: '07:00', t: 24.5, h: 64.4, a: 342.0 },
        { time: '06:00', t: 24.8, h: 47.1, a: 679.0 },
        { time: '05:00', t: 23.5, h: 55.9, a: 354.0 },
        { time: '04:00', t: 24.7, h: 53.7, a: 346.0 },
        { time: '03:00', t: 22.6, h: 50.2, a: 705.0 },
        { time: '02:00', t: 21.5, h: 54.7, a: 526.0 },
        { time: '01:00', t: 22.3, h: 56.6, a: 579.0 },
        { time: '00:00', t: 21.1, h: 46.2, a: 772.0 },
      ]
    },
    {
      date: '2026-04-03',
      logs: [
        { time: '23:00', t: 23.3, h: 53.7, a: 535.0 },
        { time: '22:00', t: 22.4, h: 59.4, a: 261.0 },
        { time: '21:00', t: 24.8, h: 47.7, a: 764.0 },
        { time: '20:00', t: 24.3, h: 54.5, a: 386.0 },
        { time: '19:00', t: 23.1, h: 64.0, a: 295.0 },
        { time: '18:00', t: 22.0, h: 54.1, a: 676.0 },
        { time: '17:00', t: 23.3, h: 53.1, a: 695.0 },
        { time: '16:00', t: 24.0, h: 53.3, a: 218.0 },
        { time: '15:00', t: 24.6, h: 56.6, a: 518.0 },
        { time: '14:00', t: 23.0, h: 47.5, a: 598.0 },
        { time: '13:00', t: 23.0, h: 51.6, a: 287.0 },
        { time: '12:00', t: 21.5, h: 62.2, a: 283.0 },
        { time: '11:00', t: 24.6, h: 49.4, a: 236.0 },
        { time: '10:00', t: 24.3, h: 48.3, a: 750.0 },
        { time: '09:00', t: 22.4, h: 59.4, a: 510.0 },
        { time: '08:00', t: 23.6, h: 58.6, a: 691.0 },
        { time: '07:00', t: 23.4, h: 64.2, a: 538.0 },
        { time: '06:00', t: 21.8, h: 47.9, a: 685.0 },
        { time: '05:00', t: 21.6, h: 64.4, a: 473.0 },
        { time: '04:00', t: 23.0, h: 47.9, a: 340.0 },
        { time: '03:00', t: 24.6, h: 59.7, a: 332.0 },
        { time: '02:00', t: 24.0, h: 45.1, a: 494.0 },
        { time: '01:00', t: 24.3, h: 45.9, a: 232.0 },
        { time: '00:00', t: 21.9, h: 50.1, a: 773.0 },
      ]
    },
    {
      date: '2026-04-02',
      logs: [
        { time: '23:00', t: 23.8, h: 57.6, a: 446.0 },
        { time: '22:00', t: 21.1, h: 52.0, a: 639.0 },
        { time: '21:00', t: 24.4, h: 55.3, a: 680.0 },
        { time: '20:00', t: 23.8, h: 60.8, a: 365.0 },
        { time: '19:00', t: 21.8, h: 47.1, a: 269.0 },
        { time: '18:00', t: 23.1, h: 56.1, a: 706.0 },
        { time: '17:00', t: 23.0, h: 52.5, a: 285.0 },
        { time: '16:00', t: 24.7, h: 47.9, a: 645.0 },
        { time: '15:00', t: 22.3, h: 63.9, a: 757.0 },
        { time: '14:00', t: 24.3, h: 61.3, a: 753.0 },
        { time: '13:00', t: 21.2, h: 60.1, a: 608.0 },
        { time: '12:00', t: 22.9, h: 46.7, a: 476.0 },
        { time: '11:00', t: 25.0, h: 46.7, a: 504.0 },
        { time: '10:00', t: 22.0, h: 56.3, a: 611.0 },
        { time: '09:00', t: 25.0, h: 63.1, a: 754.0 },
        { time: '08:00', t: 23.1, h: 54.5, a: 708.0 },
        { time: '07:00', t: 24.5, h: 49.9, a: 352.0 },
        { time: '06:00', t: 21.1, h: 46.1, a: 380.0 },
        { time: '05:00', t: 22.4, h: 53.0, a: 267.0 },
        { time: '04:00', t: 21.9, h: 59.1, a: 489.0 },
        { time: '03:00', t: 21.7, h: 63.9, a: 268.0 },
        { time: '02:00', t: 22.3, h: 59.3, a: 396.0 },
        { time: '01:00', t: 22.3, h: 51.7, a: 264.0 },
        { time: '00:00', t: 21.4, h: 57.4, a: 378.0 },
      ]
    },
    {
      date: '2026-04-01',
      logs: [
        { time: '23:00', t: 23.1, h: 60.2, a: 380.0 },
        { time: '22:00', t: 21.0, h: 45.6, a: 318.0 },
        { time: '21:00', t: 21.8, h: 58.7, a: 656.0 },
        { time: '20:00', t: 23.0, h: 52.4, a: 490.0 },
        { time: '19:00', t: 22.8, h: 56.4, a: 543.0 },
        { time: '18:00', t: 21.9, h: 58.2, a: 643.0 },
        { time: '17:00', t: 22.8, h: 53.3, a: 415.0 },
        { time: '16:00', t: 21.9, h: 49.3, a: 745.0 },
        { time: '15:00', t: 21.5, h: 51.8, a: 483.0 },
        { time: '14:00', t: 22.4, h: 49.6, a: 357.0 },
        { time: '13:00', t: 21.0, h: 62.9, a: 326.0 },
        { time: '12:00', t: 21.2, h: 54.7, a: 483.0 },
        { time: '11:00', t: 21.8, h: 54.2, a: 333.0 },
        { time: '10:00', t: 24.2, h: 63.0, a: 633.0 },
        { time: '09:00', t: 24.6, h: 59.9, a: 420.0 },
        { time: '08:00', t: 22.6, h: 57.8, a: 393.0 },
        { time: '07:00', t: 24.3, h: 59.2, a: 485.0 },
        { time: '06:00', t: 23.4, h: 62.0, a: 219.0 },
        { time: '05:00', t: 21.5, h: 57.4, a: 253.0 },
        { time: '04:00', t: 23.7, h: 64.6, a: 652.0 },
        { time: '03:00', t: 24.1, h: 53.4, a: 787.0 },
        { time: '02:00', t: 23.0, h: 63.1, a: 404.0 },
        { time: '01:00', t: 21.5, h: 49.9, a: 519.0 },
        { time: '00:00', t: 22.3, h: 64.8, a: 661.0 },
      ]
    },
    {
      date: '2026-03-31',
      logs: [
        { time: '23:00', t: 24.7, h: 58.2, a: 454.0 },
        { time: '22:00', t: 21.8, h: 53.0, a: 368.0 },
        { time: '21:00', t: 21.7, h: 51.5, a: 243.0 },
        { time: '20:00', t: 21.1, h: 48.1, a: 366.0 },
        { time: '19:00', t: 24.2, h: 57.1, a: 203.0 },
        { time: '18:00', t: 21.7, h: 62.6, a: 503.0 },
        { time: '17:00', t: 23.8, h: 60.7, a: 650.0 },
        { time: '16:00', t: 22.8, h: 45.1, a: 372.0 },
        { time: '15:00', t: 22.1, h: 46.0, a: 473.0 },
        { time: '14:00', t: 23.3, h: 54.9, a: 346.0 },
        { time: '13:00', t: 22.2, h: 60.7, a: 563.0 },
        { time: '12:00', t: 25.0, h: 57.8, a: 714.0 },
        { time: '11:00', t: 22.2, h: 62.2, a: 673.0 },
        { time: '10:00', t: 23.9, h: 47.8, a: 352.0 },
        { time: '09:00', t: 23.1, h: 46.9, a: 526.0 },
        { time: '08:00', t: 24.4, h: 45.3, a: 399.0 },
        { time: '07:00', t: 23.7, h: 52.1, a: 313.0 },
        { time: '06:00', t: 24.8, h: 63.4, a: 690.0 },
        { time: '05:00', t: 24.7, h: 63.0, a: 580.0 },
        { time: '04:00', t: 23.3, h: 57.3, a: 378.0 },
        { time: '03:00', t: 23.7, h: 47.6, a: 227.0 },
        { time: '02:00', t: 21.7, h: 54.4, a: 775.0 },
        { time: '01:00', t: 23.2, h: 55.1, a: 746.0 },
        { time: '00:00', t: 21.8, h: 49.9, a: 268.0 },
      ]
    },
    {
      date: '2026-03-30',
      logs: [
        { time: '12:00', t: 25.1, h: 57.2, a: 384.5 },
        { time: '08:00', t: 25.0, h: 57.0, a: 380.0 },
        { time: '04:00', t: 25.2, h: 57.5, a: 390.0 },
        { time: '00:00', t: 25.1, h: 57.2, a: 384.0 },
      ]
    }
  ];

  let count = 0;
  for (const dayData of historicalData) {
    for (const log of dayData.logs) {
      // Use a deterministic ID based on date and time to prevent duplicates
      const docId = `${dayData.date}_${log.time.replace(':', '-')}`;
      const newDocRef = doc(historyRef, docId);
      const timestamp = new Date(`${dayData.date}T${log.time}:00Z`).toISOString();
      
      batch.set(newDocRef, {
        timestamp,
        temperature: Number(log.t.toFixed(1)),
        humidity: Number(log.h.toFixed(1)),
        ammonia: Number(log.a.toFixed(2))
      });
      count++;
    }
  }

  try {
    await batch.commit();
    console.log('Successfully seeded', count, 'records');
  } catch (error) {
    console.error('Error seeding history:', error);
  }
}
