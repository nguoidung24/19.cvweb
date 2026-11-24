import React, { useState } from 'react';
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { AlertCircle, Building2, KeyRound, Lock, LogIn, Mail } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';

interface AuthScreenProps {
  blockedReason?: 'LOCKED' | 'NOT_INVITED' | null;
  currentEmail?: string | null;
  onSignOut?: () => void;
}

export function AuthScreen({ blockedReason, currentEmail, onSignOut }: AuthScreenProps) {
  const [mode, setMode] = useState<'LOGIN' | 'FORGOT'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleGoogleLogin() {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể đăng nhập bằng Google.';
      if (msg.includes('popup-closed-by-user')) {
        setError('Cửa sổ đăng nhập đã đóng. Vui lòng thử lại.');
      } else {
        setError('Đăng nhập thất bại. Vui lòng kiểm tra kết nối và thử lại.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim() || !password) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('operation-not-allowed')) {
        setError(
          'Phương thức Email/Mật khẩu chưa được bật trong Firebase Console (Authentication > Sign-in method). Bạn có thể dùng "Đăng nhập bằng Google" hoặc bật Email/Password trong Firebase Console.'
        );
      } else if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found')) {
        setError('Email hoặc mật khẩu không chính xác.');
      } else {
        setError('Không thể đăng nhập. Vui lòng kiểm tra lại thông tin tài khoản.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim()) {
      setError('Vui lòng nhập địa chỉ email để nhận liên kết đặt lại mật khẩu.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('Đã gửi email hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư của bạn.');
    } catch {
      setError('Không thể gửi email đặt lại mật khẩu. Vui lòng liên hệ Quản trị viên phòng ban.');
    } finally {
      setLoading(false);
    }
  }

  if (blockedReason) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-red-50 text-red-700 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-slate-900">
                {blockedReason === 'LOCKED'
                  ? 'Tài khoản đang bị tạm khóa'
                  : 'Tài khoản chưa được cấp quyền truy cập'}
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                {blockedReason === 'LOCKED'
                  ? `Tài khoản (${currentEmail || ''}) hiện đang ở trạng thái khóa. Vui lòng liên hệ Quản trị viên phòng ban để mở khóa.`
                  : `Hệ thống nội bộ không cho phép tự đăng ký. Email ${currentEmail || ''} chưa có trong danh sách nhân sự do Quản trị viên cấp.`}
              </p>
            </div>
          </div>
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="w-full py-2.5 px-4 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Đăng xuất và thử tài khoản khác
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center gap-2.5 text-slate-900">
          <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">Quản Trị Công Việc</span>
        </div>
        <p className="mt-2 text-center text-sm text-slate-600">
          Hệ thống điều hành nghiệp vụ & theo dõi tiến độ nội bộ phòng ban
        </p>
      </div>

      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-slate-900">
              {mode === 'LOGIN' ? 'Đăng nhập hệ thống' : 'Khôi phục mật khẩu'}
            </h1>
            <p className="text-xs text-slate-500">
              Tài khoản do Quản trị viên cấp phát. Không hỗ trợ tự đăng ký bên ngoài.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 leading-relaxed">
              {info}
            </div>
          )}

          {mode === 'LOGIN' ? (
            <div className="space-y-5">
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleLogin}
                className="w-full inline-flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Đăng nhập nhanh bằng Google
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-slate-500">hoặc đăng nhập bằng Email & Mật khẩu</span>
                </div>
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Email công việc
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ten.nhanvien@phongban.vn"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password" className="block text-xs font-medium text-slate-700">
                      Mật khẩu
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('FORGOT');
                        setError('');
                        setInfo('');
                      }}
                      className="text-xs font-medium text-blue-700 hover:underline"
                    >
                      Quên mật khẩu?
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Đang xác thực...' : 'Đăng nhập bằng Mật khẩu'}
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Email đã đăng ký trong hệ thống
                </label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ten.nhanvien@phongban.vn"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Đang gửi...' : 'Gửi liên kết đặt lại mật khẩu'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('LOGIN');
                  setError('');
                  setInfo('');
                }}
                className="w-full py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Quay lại màn hình đăng nhập
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
