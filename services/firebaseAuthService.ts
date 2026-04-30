import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
    getAuth,
    Auth,
    GoogleAuthProvider,
    GithubAuthProvider,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendSignInLinkToEmail,
    signInWithEmailLink,
    isSignInWithEmailLink,
    signInWithPopup,
    signOut,
    Unsubscribe,
} from 'firebase/auth';

export interface AuthUser {
    uid: string;
    email: string | null;
    displayName: string | null;
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

function getFirebaseConfig(): Record<string, string> {
    return {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
        measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
    };
}

function validateFirebaseConfig(config: Record<string, string>): void {
    const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
    const missing = required.filter(key => !config[key]);
    if (missing.length > 0) {
        throw new Error(`Firebase is not configured. Missing: ${missing.join(', ')}`);
    }
}

function getFirebaseAuth(): Auth {
    if (authInstance) return authInstance;

    const config = getFirebaseConfig();
    validateFirebaseConfig(config);

    // Reuse existing Firebase app if already initialized (e.g. hot reload)
    appInstance = getApps().length > 0 ? getApp() : initializeApp(config);
    authInstance = getAuth(appInstance);
    return authInstance;
}

function toAuthUser(user: { uid: string; email: string | null; displayName: string | null } | null): AuthUser | null {
    if (!user) return null;
    return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
    };
}

export async function onAuthUserChanged(callback: (user: AuthUser | null) => void): Promise<Unsubscribe> {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, user => callback(toAuthUser(user)));
}

export async function sendEmailLink(email: string): Promise<void> {
    const auth = getFirebaseAuth();
    const actionCodeSettings = {
        url: `${window.location.origin}${window.location.pathname}`,
        handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    localStorage.setItem('emailForSignIn', email);
}

export async function completeEmailLinkSignIn(): Promise<boolean> {
    const auth = getFirebaseAuth();
    const href = window.location.href;
    if (!isSignInWithEmailLink(auth, href)) return false;

    // Remove sensitive query params from the address bar immediately
    window.history.replaceState({}, '', `${window.location.pathname}`);

    let email = localStorage.getItem('emailForSignIn');
    if (!email) {
        email = window.prompt('Please provide your email for confirmation') || '';
    }
    if (!email) return false;

    await signInWithEmailLink(auth, email, href);
    localStorage.removeItem('emailForSignIn');
    return true;
}

export async function signInWithGoogle(): Promise<void> {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
}

export async function signInWithGithub(): Promise<void> {
    const auth = getFirebaseAuth();
    const provider = new GithubAuthProvider();
    provider.setCustomParameters({ allow_signup: 'true' });
    await signInWithPopup(auth, provider);
}

export async function signUpWithEmailPassword(email: string, password: string): Promise<void> {
    const auth = getFirebaseAuth();
    await createUserWithEmailAndPassword(auth, email, password);
}

export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser(): Promise<void> {
    const auth = getFirebaseAuth();
    await signOut(auth);
}
