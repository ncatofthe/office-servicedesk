import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LifeBuoy, Loader2, Eye, EyeOff } from 'lucide-react';
import { useProductSettings } from '../contexts/ProductSettingsContext';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const { settings } = useProductSettings();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const getRegisterErrorMessage = (err: unknown) => {
    const response = (err as { response?: { status?: number; data?: unknown } })?.response;
    const data = response?.data;

    if (data && typeof data === 'object') {
      const payload = data as { error?: unknown; message?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
      if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
    }

    if (response?.status === 429) {
      return 'Слишком много попыток регистрации за короткое время. Подождите немного и попробуйте снова.';
    }

    if (response?.status === 403) {
      return 'Самостоятельная регистрация отключена. Обратитесь к администратору ServiceDesk, чтобы он создал учётную запись.';
    }

    if (typeof data === 'string' && data.trim()) return data;
    if (response?.status) return `Ошибка регистрации, HTTP ${response.status}.`;
    return 'Ошибка регистрации.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await register({ name: name.trim(), email: email.trim().toLowerCase(), password });
      navigate('/login');
    } catch (err: unknown) {
      setError(getRegisterErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
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
            {settings?.welcomeMessage?.trim() || 'Создание аккаунта заявителя'}
          </p>
          {settings?.companyName?.trim() && (
            <p className="mt-1 break-words text-xs font-medium uppercase tracking-[0.12em] text-[#8a8a8a]" data-testid="portal-company-name">
              {settings.companyName}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-8 border border-[#e3e3e3] shadow-[0_12px_32px_rgba(0,0,0,0.06)]">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[#1f1f1f]">Регистрация</h2>
            <p className="mt-2 text-sm text-[#6b6b6b]">Заполните базовые данные, чтобы получить доступ к рабочему пространству.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="register-form">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[#4a4a4a] mb-2">Имя</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="input w-full"
                required
                data-testid="register-name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#4a4a4a] mb-2">Электронная почта</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input w-full"
                required
                data-testid="register-email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#4a4a4a] mb-2">Пароль</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input w-full pr-10"
                  required
                  minLength={10}
                  data-testid="register-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9a9a9a] hover:text-[#1f1f1f]"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="mt-2 text-xs text-[#7a7a7a]">Минимум 10 символов.</p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
              data-testid="register-submit"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Регистрация...
                </>
              ) : (
                'Зарегистрироваться'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-[#2f2f2f] underline">
              Уже есть аккаунт? Войти
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
