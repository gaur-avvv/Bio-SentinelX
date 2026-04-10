import React, { useState } from 'react';
import { Github, Mail, ShieldCheck } from 'lucide-react';
import { sendEmailLink, signInWithGithub, signInWithGoogle } from '../../services/firebaseAuthService';

export const AuthLanding: React.FC = () => {
    const [email, setEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handleSendLink = async () => {
        if (!email.trim()) {
            setError('Please enter your email.');
            return;
        }
        setError('');
        setMessage('');
        setSending(true);
        try {
            await sendEmailLink(email.trim());
            setMessage('Sign-in link sent. Please check your inbox and open the link on this device.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send sign-in link.');
        } finally {
            setSending(false);
        }
    };

    const handleGoogle = async () => {
        setError('');
        setMessage('');
        setSending(true);
        try {
            await signInWithGoogle();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Google sign-in failed.');
        } finally {
            setSending(false);
        }
    };

    const handleGithub = async () => {
        setError('');
        setMessage('');
        setSending(true);
        try {
            await signInWithGithub();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'GitHub sign-in failed.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-teal-600 rounded-2xl"><ShieldCheck className="w-6 h-6 text-white" /></div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">BioSentinel Access</h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sign in to continue</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email Link Authentication</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full pl-9 pr-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-teal-500"
                            />
                        </div>
                        <button
                            onClick={handleSendLink}
                            disabled={sending}
                            className="px-4 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest"
                        >
                            Send Link
                        </button>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400">No password needed. New users are auto-created after link verification.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">or</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                        onClick={handleGoogle}
                        disabled={sending}
                        className="w-full py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[11px] font-black uppercase tracking-widest hover:border-teal-400 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-[10px] font-black text-rose-500 border border-slate-200">G</span>
                        Continue With Google
                    </button>

                    <button
                        onClick={handleGithub}
                        disabled={sending}
                        className="w-full py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-[11px] font-black uppercase tracking-widest hover:border-teal-400 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <Github className="w-4 h-4" />
                        Continue With GitHub
                    </button>
                </div>

                {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
                {message ? <p className="text-xs font-bold text-emerald-600">{message}</p> : null}
            </div>
        </div>
    );
};

export default AuthLanding;
