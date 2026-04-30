export interface AuthUser {
    uid: string;
    email: string | null;
    displayName: string | null;
}

type Unsubscribe = () => void;

type FirebaseModules = {
    app: {
        initializeApp: (config: Record<string, string>) => unknown;
    };
    auth: {
        getAuth: (app?: unknown) => unknown;
        GoogleAuthProvider: new () => { setCustomParameters: (params: Record<string, string>) => void };
        GithubAuthProvider: new () => { setCustomParameters: (params: Record<string, string>) => void };
        isSignInWithEmailLink: (auth: unknown, href: string) => boolean;
        onAuthStateChanged: (auth: unknown, cb: (user: unknown) => void) => Unsubscribe;
        createUserWithEmailAndPassword: (auth: unknown, email: string, password: string) => Promise<unknown>;
        signInWithEmailAndPassword: (auth: unknown, email: string, password: string) => Promise<unknown>;
        sendSignInLinkToEmail: (auth: unknown, email: string, settings: Record<string, unknown>) => Promise<void>;
        signInWithEmailLink: (auth: unknown, email: string, href: string) => Promise<unknown>;
        signInWithPopup: (auth: unknown, provider: unknown) => Promise<unknown>;
        signOut: (auth: unknown) => Promise<void>;
    };
};

let modulesPromise: Promise<FirebaseModules> | null = null;
let appInstance: unknown;
let authInstance: unknown;

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

async function loadFirebaseModules(): Promise<FirebaseModules> {
    if (!modulesPromise) {
        // Use esm.sh instead of gstatic — gstatic Firebase CDN does not
        // serve the correct CORS / content-type headers for Vite dynamic imports.
        const appUrl = 'https://esm.sh/firebase@11.8.0/app';
        const authUrl = 'https://esm.sh/firebase@11.8.0/auth';
        modulesPromise = Promise.all([
            import(/* @vite-ignore */ appUrl),
            import(/* @vite-ignore */ authUrl),
        ]).then(([app, auth]) => ({ app: app as FirebaseModules['app'], auth: auth as FirebaseModules['auth'] }));
    }
    return modulesPromise;
}

async function ensureFirebase(): Promise<{ auth: unknown; modules: FirebaseModules }> {
    const modules = await loadFirebaseModules();
    const config = getFirebaseConfig();
    validateFirebaseConfig(config);

    if (!appInstance) {
        appInstance = modules.app.initializeApp(config);
    }
    if (!authInstance) {
        authInstance = modules.auth.getAuth(appInstance);
    }

    return { auth: authInstance, modules };
}

function toAuthUser(user: unknown): AuthUser | null {
    if (!user || typeof user !== 'object') return null;
    const u = user as Record<string, unknown>;
    if (typeof u.uid !== 'string') return null;
    return {
        uid: u.uid,
        email: typeof u.email === 'string' ? u.email : null,
        displayName: typeof u.displayName === 'string' ? u.displayName : null,
    };
}

export async function onAuthUserChanged(callback: (user: AuthUser | null) => void): Promise<Unsubscribe> {
    const { auth, modules } = await ensureFirebase();
    return modules.auth.onAuthStateChanged(auth, user => callback(toAuthUser(user)));
}

export async function sendEmailLink(email: string): Promise<void> {
    const { auth, modules } = await ensureFirebase();
    const actionCodeSettings = {
        url: `${window.location.origin}${window.location.pathname}`,
        handleCodeInApp: true,
    };
    await modules.auth.sendSignInLinkToEmail(auth, email, actionCodeSettings);
    localStorage.setItem('emailForSignIn', email);
}

export async function completeEmailLinkSignIn(): Promise<boolean> {
    const { auth, modules } = await ensureFirebase();
    const href = window.location.href;
    if (!modules.auth.isSignInWithEmailLink(auth, href)) return false;

    // Remove sensitive query params from the address bar immediately.
    window.history.replaceState({}, '', `${window.location.pathname}`);

    let email = localStorage.getItem('emailForSignIn');
    if (!email) {
        email = window.prompt('Please provide your email for confirmation') || '';
    }
    if (!email) return false;

    await modules.auth.signInWithEmailLink(auth, email, href);
    localStorage.removeItem('emailForSignIn');
    return true;
}

export async function signInWithGoogle(): Promise<void> {
    const { auth, modules } = await ensureFirebase();
    const provider = new modules.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await modules.auth.signInWithPopup(auth, provider);
}

export async function signInWithGithub(): Promise<void> {
    const { auth, modules } = await ensureFirebase();
    const provider = new modules.auth.GithubAuthProvider();
    provider.setCustomParameters({ allow_signup: 'true' });
    await modules.auth.signInWithPopup(auth, provider);
}

export async function signUpWithEmailPassword(email: string, password: string): Promise<void> {
    const { auth, modules } = await ensureFirebase();
    await modules.auth.createUserWithEmailAndPassword(auth, email, password);
}

export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
    const { auth, modules } = await ensureFirebase();
    await modules.auth.signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser(): Promise<void> {
    const { auth, modules } = await ensureFirebase();
    await modules.auth.signOut(auth);
}
