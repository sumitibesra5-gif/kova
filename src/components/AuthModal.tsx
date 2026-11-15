import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Lock, Mail, User, X } from 'lucide-react';
import { apiRequest, setStoredSessionToken } from '../lib/api';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { UserProfile } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

type AuthMode = 'login' | 'register' | 'reset';

export const AuthModal: React.FC<AuthModalProps> = ({ open, onClose, onSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [infoMessage, setInfoMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest<{ user: UserProfile; sessionToken?: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ identifier, password }),
        }
      );
      setStoredSessionToken(data.sessionToken);
      onSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest<{ user: UserProfile; sessionToken?: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            identifier: 'alex.studio',
            password: 'kova-demo-2026',
          }),
        }
      );
      setStoredSessionToken(data.sessionToken);
      onSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest<{ user: UserProfile; sessionToken?: string }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ username, displayName, email, password }),
        }
      );
      setStoredSessionToken(data.sessionToken);
      onSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken(true);
      const data = await apiRequest<{ user: UserProfile; sessionToken?: string }>(
        '/api/auth/firebase',
        {
          method: 'POST',
          body: JSON.stringify({ idToken }),
        }
      );
      setStoredSessionToken(data.sessionToken);
      onSuccess(data.user);
      onClose();
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code || '')
          : '';
      if (code === 'auth/popup-blocked') {
        setError('Google sign-in popup was blocked by your browser. Please allow popups and try again.');
      } else if (code === 'auth/popup-closed-by-user') {
        setError('Google sign-in window was closed before completing.');
      } else if (code === 'auth/unauthorized-domain') {
        setError('This preview domain is not authorized for Google Sign-In. Try opening in a new tab or use email sign-in.');
      } else {
        setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setLoading(true);
    try {
      const data = await apiRequest<{
        message: string;
        recoveryCodePreview?: string;
      }>('/api/auth/request-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfoMessage(
        data.recoveryCodePreview
          ? `${data.message} Recovery code: ${data.recoveryCodePreview}`
          : data.message
      );
      setResetStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code: resetCode, newPassword: password }),
      });
      setInfoMessage(data.message);
      setMode('login');
      setIdentifier(email);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#121216] border border-[#24242C] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 id="auth-modal-title" className="text-xl font-display font-bold text-white">
              {mode === 'login'
                ? 'Sign in to Kova'
                : mode === 'register'
                ? 'Create your Kova account'
                : 'Reset password'}
            </h2>
            <p className="text-xs text-[#8E8E99] mt-0.5">
              Visual stories, real-time messaging, and multimodal AI.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-2 rounded-lg text-[#8E8E99] hover:text-white hover:bg-[#1C1C22]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#0A0A0C] border border-[#1E1E26] mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'login' ? 'bg-[#1D1D24] text-white' : 'text-[#8E8E99] hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'register' ? 'bg-[#1D1D24] text-white' : 'text-[#8E8E99] hover:text-white'
            }`}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('reset');
              setResetStep('request');
              setError('');
            }}
            className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'reset' ? 'bg-[#1D1D24] text-white' : 'text-[#8E8E99] hover:text-white'
            }`}
          >
            Reset
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-[#FF385C]/10 border border-[#FF385C]/30 text-xs text-[#FF8A9E]">
            {error}
          </div>
        )}
        {infoMessage && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
            {infoMessage}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <label htmlFor="login-identifier" className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                Username or Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#71717A] absolute left-3 top-3" />
                <input
                  id="login-identifier"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="alex.studio or alex@kova.app"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#71717A] absolute left-3 top-3" />
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[#191920] hover:bg-[#22222B] border border-[#2A2A35] text-sm font-medium text-white transition-colors"
              >
                Continue with Google
              </button>
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={loading}
                className="w-full py-2 rounded-xl bg-transparent hover:bg-[#191920] border border-[#24242C] text-xs font-medium text-[#A1A1AA] hover:text-white transition-colors"
              >
                Quick Sign In as Demo Creator (@alex.studio)
              </button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label htmlFor="reg-username" className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Username
              </label>
              <input
                id="reg-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="studio.name"
                className="w-full px-3 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
              />
            </div>

            <div>
              <label htmlFor="reg-display" className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Display Name
              </label>
              <input
                id="reg-display"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jordan Vance"
                className="w-full px-3 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#71717A] absolute left-3 top-3" />
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Password (8+ characters)
              </label>
              <input
                id="reg-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                className="w-full px-3 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white placeholder:text-[#52525B] focus:outline-none focus:border-[#FF385C]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {mode === 'reset' &&
          (resetStep === 'request' ? (
            <form onSubmit={handleResetRequest} className="space-y-3.5">
              <div>
                <label htmlFor="reset-email" className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                  Account Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white focus:outline-none focus:border-[#FF385C]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] text-white text-sm font-semibold"
              >
                {loading ? 'Generating code...' : 'Send Recovery Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetConfirm} className="space-y-3.5">
              <div>
                <label htmlFor="reset-code" className="block text-xs font-medium text-[#A1A1AA] mb-1">
                  6-Digit Recovery Code
                </label>
                <input
                  id="reset-code"
                  type="text"
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white focus:outline-none focus:border-[#FF385C]"
                />
              </div>
              <div>
                <label htmlFor="reset-new-pass" className="block text-xs font-medium text-[#A1A1AA] mb-1">
                  New Password (8+ characters)
                </label>
                <input
                  id="reset-new-pass"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white focus:outline-none focus:border-[#FF385C]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] text-white text-sm font-semibold"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          ))}
      </div>
    </div>
  );
};
