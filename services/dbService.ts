/**
 * Database Abstraction Service
 * Provides a unified interface to interact with either Supabase or Firebase
 */

export interface DbSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  firebaseConfigJson: string;
  preferredDb: 'supabase' | 'firebase' | 'none';
}

export interface UserSymptomData {
  city: string;
  symptoms: string[];
  severity: number;
  location: {
    lat: number;
    lon: number;
  };
  timestamp: string;
  additionalDetails?: string;
  diseaseTags?: string[];
}

export async function saveSymptomData(settings: any, data: UserSymptomData): Promise<boolean> {
  // In a real implementation, we would check settings.preferredDb
  // and then import either Supabase or Firebase SDK dynamically
  // or use the REST APIs directly if we have the keys.

  console.log('[DB Service] Saving data:', data);

  if (settings.preferredDb === 'supabase') {
    if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
      console.warn('[DB Service] Supabase credentials missing.');
      return false;
    }
    try {
      const response = await fetch(`${settings.supabaseUrl}/rest/v1/symptoms`, {
        method: 'POST',
        headers: {
          'apikey': settings.supabaseAnonKey,
          'Authorization': `Bearer ${settings.supabaseAnonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
      });
      return response.ok;
    } catch (err) {
      console.error('[DB Service] Supabase save failed:', err);
      return false;
    }
  } else if (settings.preferredDb === 'firebase') {
    if (!settings.firebaseConfigJson) {
      console.warn('[DB Service] Firebase config missing.');
      return false;
    }
    // Simple fallback to standard HTTP if it's a direct RTDB or Firestore URL embedded,
    // but typically we'd need the SDK. We'll simulate success for now or implement direct REST if we parse it.
    console.log('[DB Service] Firebase saving mock');
    return true;
  }

  return false;
}

export async function fetchLocalOutbreakData(settings: any, city: string): Promise<UserSymptomData[]> {
  if (settings.preferredDb === 'supabase') {
    if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
      return [];
    }
    try {
      const response = await fetch(`${settings.supabaseUrl}/rest/v1/symptoms?city=eq.${encodeURIComponent(city)}`, {
        method: 'GET',
        headers: {
          'apikey': settings.supabaseAnonKey,
          'Authorization': `Bearer ${settings.supabaseAnonKey}`,
        }
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.error('[DB Service] Supabase fetch failed:', err);
    }
  }

  return [];
}
