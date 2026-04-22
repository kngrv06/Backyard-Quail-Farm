export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

import { auth } from './firebase';

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface FarmControls {
  fan: boolean;
  heater: boolean;
  light: boolean;
  cleaner: boolean;
  feed: boolean;
}

export interface FarmState {
  temperature: number;
  humidity: number;
  ammonia: number;
  feedLevel: number;
  feedLevel2: number;
  feedLevel3: number;
  feedRaw1?: number;
  feedRaw2?: number;
  feedRaw3?: number;
  lastUpdate: string;
  controls: FarmControls;
  autoMode: boolean;
}

export interface AutomationSettings {
  feedSchedule: { time: string; duration: number };
  cleanerSchedule: { time: string; duration: number };
  lightSchedule: { start: string; end: string };
}

export interface SensorHistory {
  id: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  ammonia: number;
}
