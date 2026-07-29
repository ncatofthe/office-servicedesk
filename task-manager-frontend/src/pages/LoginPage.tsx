import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LifeBuoy, Loader2, Eye, EyeOff } from 'lucide-react';
import { authApi } from '../api';
import { useProductSettings } from '../contexts/ProductSettingsContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { settings } = useProductSettings();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [publicRegistrationEnabled, setPublicRegistrationEnabled] = useState<boolean | null>(null);
  const showDevLogin = import.meta.env.DEV;

  useEffect(() => {
    let active = true;
    authApi.getConfig()
      .then((config) => {
        if (active) setPublicRegistrationEnabled(config.publicRegistrationEnabled);
      })
      .catch(() => {
        if (active) setPublicRegistrationEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const getLoginErrorMessage = (err: unknown) => {
    const response = (err as { response?: { status?: number; data?: unknown } })?.response;
    const data = response?.data;

    if (data && typeof data === 'object') {
      const payload = data as { error?: unknown; message?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
      if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
    }

    if (typeof data === 'string' && data.trim()) return data;
    if (response?.status) return `Ошибка входа, HTTP ${response.status}.`;
    return 'Ошибка входа. Проверьте данные.';
  };

  const submitLogin = async (nextEmail: string, nextPassword: string) => {
    setIsLoading(true);
    setError('');

    try {
      await login({ email: nextEmail.trim().toLowerCase(), password: nextPassword });
      navigate('/');
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitLogin(email, password);
  };

  const loginAsDemoAdmin = async () => {
    setEmail('admin@taskmanager.com');
    setPassword('password123');
    await submitLogin('admin@taskmanager.com', 'password123');
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#2f2f2f] rounded-2xl mb-4 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
            <LifeBuoy size={32} className="text-white" />
          </div>
          <h1 className="break-words text-2xl font-bold text-[#1f1f1f]" data-testid="portal-name">
            {settings?.portalName?.trim() || 'ServiceDesk'}
          </h1>
          <p className="mt-2 break-words text-[#6b6b6b]" data-testid="portal-welcome-message">
            {settings?.welcomeMessage?.trim() || 'Портал заявок и обращений'}
          </p>
          {settings?.companyName?.trim() && (
            <p className="mt-1 break-words text-xs font-medium uppercase tracking-[0.12em] text-[#8a8a8a]" data-testid="portal-company-name">
              {settings.companyName}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-8 border border-[#e3e3e3] shadow-[0_12px_32px_rgba(0,0,0,0.06)]">
          <h2 className="text-xl font-semibold text-[#1f1f1f] mb-6">Вход в систему</h2>
          <p className="mb-6 text-sm text-[#6b6b6b]">Используйте рабочую почту и пароль, чтобы открыть свои заявки и рабочую переписку.</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#4a4a4a] mb-2">
                Электронная почта
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input w-full"
                placeholder="name@company.ru"
                required
                autoComplete="email"
                data-testid="login-email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#4a4a4a] mb-2">
                Пароль
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input w-full pr-10"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  data-testid="login-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9a9a9a] hover:text-[#1f1f1f]"
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
              data-testid="login-submit"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Вход...
                </>
              ) : (
                'Войти'
              )}
            </button>

            {showDevLogin && (
              <button
                type="button"
                disabled={isLoading}
                className="btn btn-secondary w-full"
                onClick={loginAsDemoAdmin}
                data-testid="login-demo-admin"
              >
                Войти как администратор demo
              </button>
            )}
          </form>

          {publicRegistrationEnabled && <div className="mt-6 text-center" data-testid="public-registration-link">
            <Link to="/register" className="text-sm text-[#2f2f2f] underline">
              Нет аккаунта? Зарегистрироваться
            </Link>
          </div>}
        </div>
      </div>
    </div>
  );
};
