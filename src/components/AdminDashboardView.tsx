import React, { useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Lock,
  LogOut,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  apiRequest,
  clearStoredAdminToken,
  setStoredAdminToken,
} from '../lib/api';
import type { AiConfigData, ReportItem, UserProfile } from '../types';
import { Avatar } from './Avatar';
import { FormattedProse } from './FormattedProse';

interface AdminStats {
  totalUsers: number;
  totalPosts: number;
  totalMessages: number;
  pendingReports: number;
  bannedUsers: number;
  onlineNow: number;
}

export const AdminDashboardView: React.FC = () => {
  const [adminUser, setAdminUser] = useState<{ username: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<'ai' | 'users' | 'moderation'>('ai');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [aiForm, setAiForm] = useState({
    systemPrompt: '',
    personality: '',
    tone: '',
    responsePreferences: '',
  });
  const [previewPrompt, setPreviewPrompt] = useState(
    'Describe a twilight street photo in Tokyo and explain its mood.'
  );
  const [previewOutput, setPreviewOutput] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const loadDashboardData = async () => {
    try {
      const [statsRes, usersRes, reportsRes, aiRes] = await Promise.all([
        apiRequest<{ stats: AdminStats }>('/api/admin/stats'),
        apiRequest<{ users: UserProfile[] }>('/api/admin/users'),
        apiRequest<{ reports: ReportItem[] }>('/api/admin/reports'),
        apiRequest<{ config: AiConfigData }>('/api/admin/ai-config'),
      ]);
      setStats(statsRes.stats);
      setUsers(usersRes.users);
      setReports(reportsRes.reports);
      setAiForm({
        systemPrompt: aiRes.config.systemPrompt,
        personality: aiRes.config.personality,
        tone: aiRes.config.tone,
        responsePreferences: aiRes.config.responsePreferences,
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    apiRequest<{ admin: { username: string } }>('/api/admin/me')
      .then(async (res) => {
        await loadDashboardData();
        setAdminUser(res.admin);
      })
      .catch(() => setAdminUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await apiRequest<{ admin: { username: string }; adminToken?: string }>(
        '/api/admin/login',
        {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        }
      );
      setStoredAdminToken(res.adminToken);
      await loadDashboardData();
      setAdminUser(res.admin);
      setPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Admin authentication failed.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    await apiRequest('/api/admin/logout', { method: 'POST' });
    clearStoredAdminToken();
    setAdminUser(null);
  };

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMessage('');
    try {
      await apiRequest('/api/admin/ai-config', {
        method: 'PUT',
        body: JSON.stringify(aiForm),
      });
      setSaveMessage('AI system prompt and behavior updated.');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch {
      setSaveMessage('Failed to save configuration.');
    }
  };

  const handlePreviewAi = async () => {
    setPreviewLoading(true);
    setPreviewOutput('');
    try {
      const res = await apiRequest<{ text: string }>('/api/admin/ai-preview', {
        method: 'POST',
        body: JSON.stringify({
          testPrompt: previewPrompt,
          ...aiForm,
        }),
      });
      setPreviewOutput(res.text);
    } catch (err) {
      setPreviewOutput(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleToggleBan = async (userId: number) => {
    const res = await apiRequest<{ user: UserProfile }>(
      `/api/admin/users/${userId}/ban`,
      { method: 'POST' }
    );
    setUsers((prev) => prev.map((u) => (u.id === userId ? res.user : u)));
    await loadDashboardData();
  };

  const handleResolveReport = async (
    reportId: number,
    action: 'dismiss' | 'remove_target'
  ) => {
    const res = await apiRequest<{ report: ReportItem }>(
      `/api/admin/reports/${reportId}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ action }),
      }
    );
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status: res.report.status } : r))
    );
    await loadDashboardData();
  };

  if (checkingSession) {
    return (
      <div className="max-w-md mx-auto py-24 px-4 text-center text-sm text-[#8E8E99]">
        Verifying administrator session...
      </div>
    );
  }

  if (!adminUser) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <div className="rounded-2xl bg-[#121216] border border-[#24242C] p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#FF385C]/15 text-[#FF385C]">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-white">
                Administrator Console
              </h1>
              <p className="text-xs text-[#8E8E99]">
                Authorized access only. Credentials are verified server-side.
              </p>
            </div>
          </div>

          {loginError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#FF385C]/10 border border-[#FF385C]/30 text-xs text-[#FF8A9E]">
              {loginError}
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-3.5">
            <div>
              <label htmlFor="admin-username" className="block text-xs text-[#A1A1AA] mb-1">
                Admin Username
              </label>
              <input
                id="admin-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter admin username"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white focus:outline-none focus:border-[#FF385C]"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs text-[#A1A1AA] mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#71717A] absolute left-3 top-3" />
                <input
                  id="admin-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white focus:outline-none focus:border-[#FF385C]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] text-white text-sm font-semibold"
            >
              {loginLoading ? 'Signing in...' : 'Sign In to Admin Console'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E1E26] pb-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">
            Kova AI &amp; Moderation Admin
          </h1>
          <p className="text-xs text-[#8E8E99] mt-0.5">
            Signed in as administrator <span className="text-white font-semibold">{adminUser.username}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdminLogout}
          className="px-4 py-2 rounded-xl bg-[#191920] hover:bg-[#22222B] border border-[#272731] text-xs font-semibold text-[#D4D4DC] flex items-center gap-1.5 self-start"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out Admin</span>
        </button>
      </div>

      {/* Platform Statistics */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Registered Users', value: stats.totalUsers },
            { label: 'Published Posts', value: stats.totalPosts },
            { label: 'Direct Messages', value: stats.totalMessages },
            { label: 'Pending Reports', value: stats.pendingReports },
            { label: 'Banned Accounts', value: stats.bannedUsers },
            { label: 'Online Right Now', value: stats.onlineNow },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl bg-[#121216] border border-[#1E1E26] p-4"
            >
              <p className="text-xs text-[#8E8E99]">{item.label}</p>
              <p className="text-2xl font-display font-bold font-mono-tabular text-white mt-1">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Admin Sub-Navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121216] border border-[#24242C] w-fit">
        <button
          type="button"
          onClick={() => setTab('ai')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'ai' ? 'bg-[#FF385C] text-white' : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          AI Behavior &amp; Prompt
        </button>
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'users' ? 'bg-[#FF385C] text-white' : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          Users ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('moderation')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'moderation' ? 'bg-[#FF385C] text-white' : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          Reports ({reports.filter((r) => r.status === 'pending').length})
        </button>
      </div>

      {tab === 'ai' && (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <form
            onSubmit={handleSaveAiConfig}
            className="rounded-2xl bg-[#121216] border border-[#24242C] p-6 space-y-4"
          >
            <h2 className="text-base font-display font-bold text-white">
              AI Assistant System Configuration
            </h2>

            {saveMessage && (
              <div className="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                {saveMessage}
              </div>
            )}

            <div>
              <label htmlFor="ai-system-prompt" className="block text-xs text-[#A1A1AA] mb-1">
                System Prompt
              </label>
              <textarea
                id="ai-system-prompt"
                rows={4}
                required
                value={aiForm.systemPrompt}
                onChange={(e) => setAiForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white focus:outline-none focus:border-[#FF385C]"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ai-personality" className="block text-xs text-[#A1A1AA] mb-1">
                  Personality
                </label>
                <input
                  id="ai-personality"
                  type="text"
                  value={aiForm.personality}
                  onChange={(e) => setAiForm((f) => ({ ...f, personality: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="ai-tone" className="block text-xs text-[#A1A1AA] mb-1">
                  Tone
                </label>
                <input
                  id="ai-tone"
                  type="text"
                  value={aiForm.tone}
                  onChange={(e) => setAiForm((f) => ({ ...f, tone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label htmlFor="ai-prefs" className="block text-xs text-[#A1A1AA] mb-1">
                Response Preferences &amp; Guardrails
              </label>
              <textarea
                id="ai-prefs"
                rows={3}
                value={aiForm.responsePreferences}
                onChange={(e) =>
                  setAiForm((f) => ({ ...f, responsePreferences: e.target.value }))
                }
                className="w-full px-3.5 py-2 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white"
              />
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#FF385C] hover:bg-[#E11D48] text-white text-xs font-semibold"
            >
              Save &amp; Apply AI Configuration
            </button>
          </form>

          {/* Live AI Preview Before Applying */}
          <div className="rounded-2xl bg-[#121216] border border-[#24242C] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#FF385C]" />
              <h2 className="text-base font-display font-bold text-white">
                Preview AI Response Before Applying
              </h2>
            </div>

            <div>
              <label htmlFor="ai-preview-input" className="block text-xs text-[#A1A1AA] mb-1">
                Sample User Prompt
              </label>
              <textarea
                id="ai-preview-input"
                rows={2}
                value={previewPrompt}
                onChange={(e) => setPreviewPrompt(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-sm text-white"
              />
            </div>

            <button
              type="button"
              onClick={handlePreviewAi}
              disabled={previewLoading || !aiForm.systemPrompt.trim()}
              className="px-4 py-2 rounded-xl bg-[#191920] hover:bg-[#24242E] disabled:opacity-50 border border-[#2A2A35] text-xs font-semibold text-white"
            >
              {previewLoading ? 'Generating preview...' : 'Test Current Prompt'}
            </button>

            {previewOutput && (
              <div className="p-4 rounded-xl bg-[#0A0A0C] border border-[#24242C] text-xs text-[#E4E4E7] leading-relaxed">
                <FormattedProse text={previewOutput} />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="rounded-2xl bg-[#121216] border border-[#24242C] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0E0E12] border-b border-[#1E1E26] text-[#8E8E99]">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A22]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#17171D]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={u.avatarUrl} alt={u.displayName} size="sm" />
                        <div>
                          <p className="font-semibold text-white">{u.displayName}</p>
                          <p className="text-[#8E8E99]">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#D4D4DC]">{u.email}</td>
                    <td className="px-4 py-3 text-[#A1A1AA] capitalize">{u.role}</td>
                    <td className="px-4 py-3">
                      {u.isBanned ? (
                        <span className="text-[#FF6B85] font-semibold">Banned</span>
                      ) : !u.isActive ? (
                        <span className="text-[#8E8E99]">Deactivated</span>
                      ) : (
                        <span className="text-emerald-400">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleToggleBan(u.id)}
                          className={`px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1 ${
                            u.isBanned
                              ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                              : 'bg-[#FF385C]/15 text-[#FF8A9E] hover:bg-[#FF385C]/25'
                          }`}
                        >
                          {u.isBanned ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Unban</span>
                            </>
                          ) : (
                            <>
                              <Ban className="w-3.5 h-3.5" />
                              <span>Ban</span>
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'moderation' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <p className="text-sm text-[#8E8E99] py-8">No moderation reports found.</p>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                className="rounded-xl bg-[#121216] border border-[#24242C] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-[#8E8E99]">
                    <span className="font-semibold text-white capitalize">
                      {r.targetType} #{r.targetId}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Reported by @{r.reporter?.username || 'user'}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        r.status === 'pending'
                          ? 'text-amber-400 font-semibold'
                          : 'text-[#A1A1AA]'
                      }
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-sm text-[#E4E4E7]">{r.reason}</p>
                  <p className="text-xs text-[#8E8E99] italic">
                    Target: “{r.targetPreview}”
                  </p>
                </div>

                {r.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleResolveReport(r.id, 'dismiss')}
                      className="px-3 py-1.5 rounded-lg bg-[#191920] hover:bg-[#23232E] text-xs font-semibold text-[#D4D4DC]"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveReport(r.id, 'remove_target')}
                      className="px-3 py-1.5 rounded-lg bg-[#FF385C] hover:bg-[#E11D48] text-xs font-semibold text-white flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove Content</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
