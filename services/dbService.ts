/**
 * Database abstraction for symptom/outbreak signal storage.
 * Supports Supabase REST and Firebase Realtime Database REST with fallback.
 */

import { DatabaseSettings } from '../types';

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
    imageDataUrl?: string;
    diseaseTags?: string[];
}

interface FirebaseParsedConfig {
    databaseURL?: string;
    apiKey?: string;
}

function hasSupabaseConfig(settings: DatabaseSettings): boolean {
    return Boolean(settings.supabaseUrl?.trim() && settings.supabaseAnonKey?.trim());
}

function parseFirebaseConfig(settings: DatabaseSettings): FirebaseParsedConfig {
    if (!settings.firebaseConfigJson?.trim()) {
        return { apiKey: settings.firebaseApiKey?.trim() || undefined };
    }

    const raw = settings.firebaseConfigJson.trim();

    // Allow direct database URL for convenience.
    if (/^https?:\/\//i.test(raw)) {
        return {
            databaseURL: raw.replace(/\/+$/, ''),
            apiKey: settings.firebaseApiKey?.trim() || undefined,
        };
    }

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return {
            databaseURL: typeof parsed.databaseURL === 'string' ? parsed.databaseURL.replace(/\/+$/, '') : undefined,
            apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : (settings.firebaseApiKey?.trim() || undefined),
        };
    } catch {
        return { apiKey: settings.firebaseApiKey?.trim() || undefined };
    }
}

function hasFirebaseConfig(settings: DatabaseSettings): boolean {
    const parsed = parseFirebaseConfig(settings);
    return Boolean(parsed.databaseURL);
}

function providerOrder(settings: DatabaseSettings): Array<'supabase' | 'firebase'> {
    if (settings.preferredDb === 'supabase') return ['supabase', 'firebase'];
    if (settings.preferredDb === 'firebase') return ['firebase', 'supabase'];
    // If none selected, still try available providers in deterministic order.
    return ['supabase', 'firebase'];
}

function mapRowToSymptomData(row: Record<string, unknown>): UserSymptomData | null {
    const city = typeof row.city === 'string' ? row.city : '';
    const symptoms = Array.isArray(row.symptoms) ? row.symptoms.filter((v): v is string => typeof v === 'string') : [];
    const severity = typeof row.severity === 'number' ? row.severity : Number(row.severity ?? 0);
    const timestamp = typeof row.timestamp === 'string' ? row.timestamp : '';
    const lat = Number((row as any)?.location?.lat ?? row.lat ?? NaN);
    const lon = Number((row as any)?.location?.lon ?? row.lon ?? NaN);

    if (!city || !timestamp || !Array.isArray(symptoms)) return null;

    return {
        city,
        symptoms,
        severity: Number.isFinite(severity) ? severity : 0,
        timestamp,
        location: {
            lat: Number.isFinite(lat) ? lat : 0,
            lon: Number.isFinite(lon) ? lon : 0,
        },
        additionalDetails: typeof row.additionalDetails === 'string' ? row.additionalDetails : undefined,
        imageDataUrl: typeof row.imageDataUrl === 'string' ? row.imageDataUrl : undefined,
        diseaseTags: Array.isArray(row.diseaseTags)
            ? row.diseaseTags.filter((v): v is string => typeof v === 'string')
            : undefined,
    };
}

async function saveToSupabase(settings: DatabaseSettings, data: UserSymptomData): Promise<boolean> {
    if (!hasSupabaseConfig(settings)) return false;

    try {
        const base = settings.supabaseUrl.replace(/\/+$/, '');
        const response = await fetch(`${base}/rest/v1/symptoms`, {
            method: 'POST',
            headers: {
                apikey: settings.supabaseAnonKey,
                Authorization: `Bearer ${settings.supabaseAnonKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify(data),
        });
        return response.ok;
    } catch (err) {
        console.error('[DB Service] Supabase save failed:', err);
        return false;
    }
}

async function fetchFromSupabase(settings: DatabaseSettings, city: string): Promise<UserSymptomData[] | null> {
    if (!hasSupabaseConfig(settings)) return null;

    try {
        const base = settings.supabaseUrl.replace(/\/+$/, '');
        const response = await fetch(
            `${base}/rest/v1/symptoms?city=eq.${encodeURIComponent(city)}&order=timestamp.desc&limit=100`,
            {
                method: 'GET',
                headers: {
                    apikey: settings.supabaseAnonKey,
                    Authorization: `Bearer ${settings.supabaseAnonKey}`,
                },
            }
        );

        if (!response.ok) return null;
        const payload = await response.json();
        if (!Array.isArray(payload)) return [];

        return payload
            .map((row) => mapRowToSymptomData(row as Record<string, unknown>))
            .filter((row): row is UserSymptomData => Boolean(row));
    } catch (err) {
        console.error('[DB Service] Supabase fetch failed:', err);
        return null;
    }
}

async function saveToFirebase(settings: DatabaseSettings, data: UserSymptomData): Promise<boolean> {
    const cfg = parseFirebaseConfig(settings);
    if (!cfg.databaseURL) return false;

    try {
        const token = cfg.apiKey ? `?auth=${encodeURIComponent(cfg.apiKey)}` : '';
        const pathCity = encodeURIComponent(data.city.toLowerCase().replace(/\s+/g, '-'));
        const response = await fetch(`${cfg.databaseURL}/symptoms/${pathCity}.json${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return response.ok;
    } catch (err) {
        console.error('[DB Service] Firebase save failed:', err);
        return false;
    }
}

async function fetchFromFirebase(settings: DatabaseSettings, city: string): Promise<UserSymptomData[] | null> {
    const cfg = parseFirebaseConfig(settings);
    if (!cfg.databaseURL) return null;

    try {
        const token = cfg.apiKey ? `?auth=${encodeURIComponent(cfg.apiKey)}` : '';
        const pathCity = encodeURIComponent(city.toLowerCase().replace(/\s+/g, '-'));
        const response = await fetch(`${cfg.databaseURL}/symptoms/${pathCity}.json${token}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) return null;
        const payload = await response.json();
        if (!payload || typeof payload !== 'object') return [];

        return Object.values(payload as Record<string, unknown>)
            .map((row) => mapRowToSymptomData((row ?? {}) as Record<string, unknown>))
            .filter((row): row is UserSymptomData => Boolean(row));
    } catch (err) {
        console.error('[DB Service] Firebase fetch failed:', err);
        return null;
    }
}

export async function saveSymptomData(settings: DatabaseSettings, data: UserSymptomData): Promise<boolean> {
    for (const provider of providerOrder(settings)) {
        if (provider === 'supabase' && hasSupabaseConfig(settings)) {
            if (await saveToSupabase(settings, data)) return true;
        }
        if (provider === 'firebase' && hasFirebaseConfig(settings)) {
            if (await saveToFirebase(settings, data)) return true;
        }
    }

    return false;
}

export async function fetchLocalOutbreakData(settings: DatabaseSettings, city: string): Promise<UserSymptomData[]> {
    for (const provider of providerOrder(settings)) {
        if (provider === 'supabase' && hasSupabaseConfig(settings)) {
            const records = await fetchFromSupabase(settings, city);
            if (records) return records;
        }
        if (provider === 'firebase' && hasFirebaseConfig(settings)) {
            const records = await fetchFromFirebase(settings, city);
            if (records) return records;
        }
    }

    return [];
}
