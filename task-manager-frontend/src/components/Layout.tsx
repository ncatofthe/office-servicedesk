import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  ChevronRight,
  Home,
  LayoutGrid,
  LifeBuoy,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Ticket,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProductSettings } from '../contexts/ProductSettingsContext';
import { chatsApi, notificationsApi } from '../api';
import type { Notification } from '../types';
import { UserAvatar } from './ui/UserAvatar';
import { APP_NAV_ITEMS, canAccessModule, canCreateTasks, isModuleFeatureEnabled } from '../access';
import { formatDateTime } from '../utils';
import { getProfileExtras, PROFILE_EXTRAS_UPDATED_EVENT } from '../utils/profile-extras';

const NEW_TASK_NOTIFICATION_TYPES = ['TASK_CREATED_WEB', 'TASK_CREATED_EMAIL'];

const notificationTypeLabels: Record<string, string> = {
  TASK_CREATED: 'Новая заявка',
  TASK_CREATED_WEB: 'Новая заявка',
  TASK_CREATED_EMAIL: 'Новая заявка из почты',
  TASK_UPDATED: 'Заявка обновлена',
  STATUS_CHANGED: 'Статус изменён',
  TASK_STATUS_CHANGED: 'Статус заявки изменён',
  COMMENT_ADDED: 'Новый комментарий',
  REQUESTER_COMMENT: 'Новый ответ заявителя',
  AGENT_PUBLIC_COMMENT: 'Новый ответ по заявке',
  INTERNAL_NOTE_ADDED: 'Внутренняя заметка',
  AGENT_INTERNAL_NOTE: 'Внутренняя заметка',
  TASK_ASSIGNED: 'Вам назначена заявка',
  TASK_MERGED: 'Заявки объединены',
  EMAIL_REPLY_SENT: 'Email-ответ',
  EMAIL_FAILED: 'Ошибка email',
  EMAIL_OUTBOUND_FAILED: 'Ошибка email-отправки',
  EMAIL_OUTBOUND_RECOVERED: 'Email доставлен после повтора',
  CANNED_REPLY_USED: 'Шаблон ответа',
};

const taskStatusLabels: Record<string, string> = {
  NEW: 'Необработано',
  IN_PROGRESS: 'В процессе',
  DONE: 'Закрыто',
  MERGED: 'Объединена',
  REVIEW: 'На проверке',
};

const getTaskStatusLabel = (status: string) => taskStatusLabels[status.toUpperCase()] || status;

const getNotificationTaskName = (notification: Notification, fallback?: string) => {
  const taskTitle = notification.task?.title?.trim() || fallback?.trim();
  return taskTitle ? `«${taskTitle}»` : 'заявка';
};

const getStatusTransition = (notification: Notification) => {
  const metadataFrom = notification.metadata?.fromStatus;
  const metadataTo = notification.metadata?.toStatus;
  if (typeof metadataFrom === 'string' && typeof metadataTo === 'string') {
    return { from: metadataFrom, to: metadataTo, taskName: notification.task?.title };
  }

  const rawMessage = notification.description?.trim() || notification.message?.trim() || '';
  const match = rawMessage.match(/^Task\s+["“](.+?)["”]\s+status changed from\s+([A-Z_]+)\s+to\s+([A-Z_]+)\.?$/i);
  if (!match) {
    return null;
  }

  return { taskName: match[1], from: match[2], to: match[3] };
};

const getNotificationTypeLabel = (type?: string) => {
  if (!type) {
    return 'Уведомление';
  }

  return notificationTypeLabels[type.toUpperCase()] || 'Уведомление';
};

const getNotificationMessage = (notification: Notification) => {
  const transition = getStatusTransition(notification);
  if (transition) {
    return `${getNotificationTaskName(notification, transition.taskName)}: ${getTaskStatusLabel(transition.from)} → ${getTaskStatusLabel(transition.to)}.`;
  }

  const rawMessage = notification.description?.trim() || notification.message?.trim() || '';
  const reviewMatch = rawMessage.match(/^Task\s+["“](.+?)["”]\s+moved to review\.?$/i);
  if (reviewMatch) {
    return `${getNotificationTaskName(notification, reviewMatch[1])} отправлена на проверку.`;
  }

  return rawMessage || 'Новое событие в ServiceDesk.';
};

const getNotificationTitle = (notification: Notification) => {
  if (getStatusTransition(notification)) {
    return 'Статус заявки изменён';
  }

  const rawMessage = notification.description?.trim() || notification.message?.trim() || '';
  if (/^Task\s+["“].+?["”]\s+moved to review\.?$/i.test(rawMessage)) {
    return 'Заявка отправлена на проверку';
  }

  const title = notification.title?.trim();
  if (title && !/^notification$/i.test(title) && title.toLowerCase() !== 'уведомление') {
    return title;
  }

  return getNotificationTypeLabel(notification.type);
};

const getSafeNotificationReason = (notification: Notification) => {
  const metadataReason = notification.metadata?.safeReason || notification.metadata?.errorMessage || notification.metadata?.reason;
  const reason = notification.safeReason || (typeof metadataReason === 'string' ? metadataReason : '');
  const trimmed = reason.trim();

  if (!trimmed || trimmed.length > 220 || trimmed.includes('\n') || trimmed.includes(' at ')) {
    return '';
  }

  return trimmed;
};

const isEndpointUnavailable = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 405 || status === 501;
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const { settings, isFeatureEnabled } = useProductSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const isRequester = user?.role === 'REQUESTER';
  const visibleNavItems = APP_NAV_ITEMS
    .filter((item) => canAccessModule(user?.role, item.moduleKey) && isModuleFeatureEnabled(settings, item.moduleKey))
    .map((item) => ({
      ...item,
      label: isRequester && item.path === '/tickets'
        ? 'Мои заявки'
        : isRequester && item.path === '/knowledge'
          ? 'Помощь'
          : item.label,
    }));
  const primaryNavItems = visibleNavItems.filter((item) => (
    ['/', '/tickets', '/chats', '/queue', '/knowledge'].includes(item.path)
  ));
  const secondaryNavItems = visibleNavItems.filter((item) => (
    !['/', '/tickets', '/chats', '/queue', '/knowledge'].includes(item.path)
  ));
  const isNavItemActive = (path: string) => (
    location.pathname === path
    || (path === '/tickets' && location.pathname === '/tasks')
    || (path === '/queue' && location.pathname === '/kanban')
  );
  const getNavIcon = (path: string) => {
    if (path === '/') return Home;
    if (path === '/tickets') return Ticket;
    if (path === '/chats') return MessageCircle;
    if (path === '/queue') return LayoutGrid;
    if (path === '/knowledge') return BookOpen;
    return null;
  };

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsDrawerOpen, setNotificationsDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [taskUnreadCount, setTaskUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationsReady, setNotificationsReady] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDetailsElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(() => user?.avatar || getProfileExtras(user?.id).avatarDataUrl);

  const sortedNotifications = useMemo(
    () => [...notifications].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [notifications]
  );
  const latestNotifications = sortedNotifications.slice(0, 5);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleOpenProfile = () => {
    setProfileMenuOpen(false);
    navigate('/profile');
  };

  const syncUnreadCount = useCallback(async () => {
    try {
      const count = await notificationsApi.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      if (!isEndpointUnavailable(error)) {
        setNotificationsError('Не удалось обновить счётчик уведомлений.');
      }
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      setLoadingNotifications(true);
      setNotificationsError('');
      const data = await notificationsApi.getAll({ limit: 30 });
      setNotifications(data);
      setUnreadCount(data.filter((item) => !item.isRead).length);
      setNotificationsReady(true);
    } catch (error) {
      if (isEndpointUnavailable(error)) {
        setNotifications([]);
        setUnreadCount(0);
        setNotificationsReady(false);
        setNotificationsError('Центр уведомлений пока недоступен.');
        return;
      }

      setNotificationsError('Не удалось загрузить уведомления.');
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  useEffect(() => {
    setAvatarDataUrl(user?.avatar || getProfileExtras(user?.id).avatarDataUrl);
  }, [user?.avatar, user?.id]);

  useEffect(() => {
    if (!isFeatureEnabled('notifications')) {
      setUnreadCount(0);
      setNotifications([]);
      setNotificationsOpen(false);
      setNotificationsDrawerOpen(false);
      return;
    }

    void syncUnreadCount();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncUnreadCount();
      }
    }, 60000);

    return () => window.clearInterval(timer);
  }, [isFeatureEnabled, syncUnreadCount]);

  useEffect(() => {
    if (!isFeatureEnabled('chats')) {
      setChatUnreadCount(0);
      return;
    }

    const syncChatUnreadCount = async () => {
      try {
        setChatUnreadCount(await chatsApi.getUnreadCount());
      } catch {
        setChatUnreadCount(0);
      }
    };

    void syncChatUnreadCount();
    if (location.pathname === '/chats') {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncChatUnreadCount();
      }
    }, 30000);

    return () => window.clearInterval(timer);
  }, [isFeatureEnabled, location.pathname]);

  useEffect(() => {
    if (!isFeatureEnabled('tickets')) {
      setTaskUnreadCount(0);
      return;
    }

    if (location.pathname === '/tasks') {
      setTaskUnreadCount(0);
      notificationsApi.markAllRead(NEW_TASK_NOTIFICATION_TYPES).catch(() => undefined);
      return;
    }

    const syncTaskUnreadCount = async () => {
      try {
        setTaskUnreadCount(await notificationsApi.getUnreadCount(NEW_TASK_NOTIFICATION_TYPES));
      } catch {
        setTaskUnreadCount(0);
      }
    };

    void syncTaskUnreadCount();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncTaskUnreadCount();
      }
    }, 30000);

    return () => window.clearInterval(timer);
  }, [isFeatureEnabled, location.pathname]);

  useEffect(() => {
    const handleProfileExtrasUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!user?.id || detail?.userId !== user.id) {
        return;
      }

      setAvatarDataUrl(user.avatar || getProfileExtras(user.id).avatarDataUrl);
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }

      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }

      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }

      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (target.dataset.notificationDrawerOverlay === 'true') {
          setNotificationsDrawerOpen(false);
        }
      }
    };

    window.addEventListener(PROFILE_EXTRAS_UPDATED_EVENT, handleProfileExtrasUpdated as EventListener);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener(PROFILE_EXTRAS_UPDATED_EVENT, handleProfileExtrasUpdated as EventListener);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [user?.avatar, user?.id]);

  useEffect(() => {
    setMoreMenuOpen(false);
  }, [location.pathname, location.search]);

  const openNotifications = async () => {
    if (window.matchMedia('(max-width: 639px)').matches) {
      await openNotificationsDrawer();
      return;
    }

    setNotificationsOpen((current) => !current);
    if (!notificationsReady || notifications.length === 0) {
      await loadNotifications();
    }
  };

  const openNotificationsDrawer = async () => {
    setNotificationsDrawerOpen(true);
    setNotificationsOpen(false);
    await loadNotifications();
  };

  const markNotificationRead = async (notificationId: string) => {
    try {
      await notificationsApi.markRead(notificationId);
      setNotifications((current) => current.map((item) => (
        item.id === notificationId ? { ...item, isRead: true } : item
      )));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch {
      setNotificationsError('Не удалось отметить уведомление как прочитанное.');
    }
  };

  const markAllRead = async () => {
    try {
      setMarkingAllRead(true);
      setNotificationsError('');
      await notificationsApi.markAllRead();
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch {
      setNotificationsError('Не удалось отметить уведомления как прочитанные.');
    } finally {
      setMarkingAllRead(false);
    }
  };

  const openNotificationTask = async (notification: Notification) => {
    if (!notification.isRead) {
      await markNotificationRead(notification.id);
    }

    setNotificationsOpen(false);
    setNotificationsDrawerOpen(false);

    if (notification.taskId) {
      navigate(`/tickets?taskId=${notification.taskId}`);
      return;
    }

    navigate('/tickets');
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(226,233,236,0.85) 0%, rgba(226,233,236,0) 28%), radial-gradient(circle at top right, rgba(244,238,228,0.9) 0%, rgba(244,238,228,0) 24%), var(--bg-page)',
      }}
    >
      <header className="sticky top-0 z-30 border-b border-[#e7e7e5] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto max-w-[1440px] px-3 sm:px-4">
          <div className="flex h-[58px] items-center gap-2.5">
            <Link to="/" className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-[10px] transition-opacity hover:opacity-80" aria-label="На главную">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#252525] text-white">
                <LifeBuoy size={18} />
              </div>
              <div className="hidden min-w-0 xl:block">
                {settings?.companyName?.trim() && settings.companyName.trim() !== settings.portalName.trim() && (
                  <p className="truncate text-[9px] font-medium uppercase tracking-[0.16em] text-[#999]" data-testid="layout-company-name">
                    {settings.companyName}
                  </p>
                )}
                <p className="truncate text-[13px] font-semibold leading-4 text-[#242424]" data-testid="layout-portal-name">
                  {settings?.portalName?.trim() || 'Office ServiceDesk'}
                </p>
              </div>
            </Link>

            <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
              {primaryNavItems.map((item) => {
                  const active = isNavItemActive(item.path);
                  const NavIcon = getNavIcon(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 text-center text-[13px] font-medium transition-colors xl:px-3 ${
                        active
                          ? 'bg-[#292929] text-white'
                          : 'text-[#5f5f5f] hover:bg-[#f2f2f0] hover:text-[#222]'
                      }`}
                    >
                      {NavIcon && <NavIcon size={14} strokeWidth={1.9} />}
                      <span>{item.label}</span>
                      {item.path === '/chats' && chatUnreadCount > 0 && (
                        <span className={`flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] ${
                          active ? 'bg-white text-[#2f2f2f]' : 'bg-[#2f2f2f] text-white'
                        }`}>
                          {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                        </span>
                      )}
                      {item.path === '/tickets' && taskUnreadCount > 0 && (
                        <span className={`flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] ${
                          active ? 'bg-white text-[#2f2f2f]' : 'bg-[#2f2f2f] text-white'
                        }`}>
                          {taskUnreadCount > 99 ? '99+' : taskUnreadCount}
                        </span>
                      )}
                    </Link>
                  );
              })}
              {secondaryNavItems.length > 0 && (
                <details
                  ref={moreMenuRef}
                  open={moreMenuOpen}
                  onToggle={(event) => setMoreMenuOpen(event.currentTarget.open)}
                  className="group relative shrink-0"
                >
                  <summary className={`flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-medium transition-colors [&::-webkit-details-marker]:hidden ${
                    secondaryNavItems.some((item) => isNavItemActive(item.path))
                      ? 'bg-[#292929] text-white'
                      : 'text-[#5f5f5f] hover:bg-[#f2f2f0] hover:text-[#222]'
                  }`}>
                    <MoreHorizontal size={16} />
                    <span className="hidden xl:inline">Ещё</span>
                  </summary>
                  <div className="absolute right-0 top-11 w-56 rounded-[13px] border border-[#e2e2e0] bg-white p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.12)]">
                    {secondaryNavItems.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMoreMenuOpen(false)}
                        className={`flex h-10 items-center rounded-[9px] px-3 text-sm font-medium ${
                          isNavItemActive(item.path)
                            ? 'bg-[#f0f0ee] text-[#222]'
                            : 'text-[#555] hover:bg-[#f6f6f4] hover:text-[#222]'
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </nav>

            <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1.5">
              {canCreateTasks(user?.role) && isFeatureEnabled('ticketCreation') && (
                <>
                  <Link
                    to="/tickets?create=1"
                    className="hidden h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] bg-[#292929] px-3 text-[13px] font-medium text-white transition hover:bg-[#171717] sm:inline-flex"
                    data-testid="header-create-ticket"
                  >
                    <Plus size={15} />
                    Новая заявка
                  </Link>
                  <Link
                    to="/tickets?create=1"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#292929] text-white sm:hidden"
                    aria-label="Создать заявку"
                  >
                    <Plus size={17} />
                  </Link>
                </>
              )}

              {isFeatureEnabled('notifications') && <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  className="relative flex h-9 w-9 items-center justify-center rounded-[9px] text-[#4f4f4f] transition-colors hover:bg-[#f1f1ef] hover:text-[#222]"
                  onClick={() => void openNotifications()}
                  data-testid="notification-bell"
                  aria-label="Открыть уведомления"
                >
                  <Bell size={17} />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#2f2f2f] px-1 text-[10px] text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="fixed left-3 right-3 top-[76px] w-auto rounded-[16px] border border-[#dedede] bg-white p-3 shadow-[0px_18px_40px_rgba(0,0,0,0.1)] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(390px,calc(100vw-2rem))]" data-testid="notifications-dropdown">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#353535]">Уведомления</p>
                        <p className="text-xs text-[#8a8a8a]">Последние события по вашим заявкам.</p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 whitespace-nowrap text-xs font-medium text-[#4f4f4f] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-[#a0a0a0]"
                        onClick={() => void markAllRead()}
                        disabled={markingAllRead || unreadCount === 0 || !notificationsReady}
                        data-testid="notification-read-all"
                      >
                        {markingAllRead ? 'Отмечаем...' : 'Отметить всё прочитанным'}
                      </button>
                    </div>

                    <div className="mt-3">
                      {loadingNotifications ? (
                        <p className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] px-3 py-4 text-sm text-[#6b6b6b]">Загружаем уведомления...</p>
                      ) : notificationsError ? (
                        <p className="rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-4 text-sm text-[#b23b3b]">{notificationsError}</p>
                      ) : latestNotifications.length === 0 ? (
                        <p className="rounded-[12px] border border-dashed border-[#dddddd] bg-[#fcfcfc] px-3 py-4 text-sm text-[#6b6b6b]">Новых уведомлений пока нет.</p>
                      ) : (
                        <div className="space-y-2">
                          {latestNotifications.map((notification) => (
                            <button
                              key={notification.id}
                              type="button"
                              className={`w-full rounded-[12px] border px-3 py-3 text-left transition-colors ${
                                notification.isRead
                                  ? 'border-[#e6e6e6] bg-white'
                                  : 'border-[#d8dfef] bg-[#f8faff]'
                              }`}
                              onClick={() => void openNotificationTask(notification)}
                              data-testid="notification-item"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="break-words text-sm font-semibold leading-5 text-[#1f1f1f] [overflow-wrap:anywhere]">{getNotificationTitle(notification)}</p>
                                  <p className="mt-1 break-words text-sm leading-5 text-[#5f5f5f] [overflow-wrap:anywhere]">{getNotificationMessage(notification)}</p>
                                  <p className="mt-2 text-xs text-[#8a8a8a]">{formatDateTime(notification.createdAt)}</p>
                                </div>
                                {!notification.isRead && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#2f2f2f]" />}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="mt-3 flex w-full items-center justify-between rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] px-3 py-2 text-sm font-medium text-[#303030]"
                      onClick={() => void openNotificationsDrawer()}
                    >
                      Все уведомления
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>}

              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((value) => !value)}
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#ececea] text-xs font-semibold text-[#353535] ring-1 ring-[#ddddda] transition hover:ring-[#bfbfbb]"
                  aria-label="Открыть профиль"
                >
                  <UserAvatar
                    name={user?.name}
                    avatar={avatarDataUrl}
                    className="h-full w-full bg-[#ececea] text-[#505050]"
                  />
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-xl border border-[#dedede] bg-white p-2 shadow-[0px_10px_30px_rgba(0,0,0,0.06)]">
                    <button
                      type="button"
                      onClick={handleOpenProfile}
                      className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-sm text-[#353535] hover:bg-[#f6f6f6]"
                    >
                      Профиль
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="mt-1 flex w-full items-center rounded-[10px] px-3 py-2 text-left text-sm text-[#353535] hover:bg-[#f6f6f6]"
                    >
                      Выйти
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <nav className="flex min-w-0 gap-1 overflow-x-auto border-t border-[#ededeb] py-1.5 lg:hidden">
            {visibleNavItems.map((item) => {
              const active = isNavItemActive(item.path);
              const NavIcon = getNavIcon(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium ${
                    active ? 'bg-[#292929] text-white' : 'text-[#666] hover:bg-[#f2f2f0]'
                  }`}
                >
                  {NavIcon && <NavIcon size={13} />}
                  <span>{item.label}</span>
                  {item.path === '/chats' && chatUnreadCount > 0 && (
                    <span className={`flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] ${
                      active ? 'bg-white text-[#292929]' : 'bg-[#292929] text-white'
                    }`}>
                      {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                    </span>
                  )}
                  {item.path === '/tickets' && taskUnreadCount > 0 && (
                    <span className={`flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] ${
                      active ? 'bg-white text-[#292929]' : 'bg-[#292929] text-white'
                    }`}>
                      {taskUnreadCount > 99 ? '99+' : taskUnreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {isFeatureEnabled('notifications') && notificationsDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(15,15,15,0.32)] sm:px-4 sm:py-4"
          data-notification-drawer-overlay="true"
        >
          <div ref={drawerRef} className="ml-auto flex h-full w-full max-w-[480px] flex-col border border-[#dddddd] bg-white shadow-[0_22px_48px_rgba(0,0,0,0.16)] sm:rounded-[20px]" data-testid="notifications-drawer">
            <div className="flex items-start justify-between gap-4 border-b border-[#ececec] px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-base font-semibold text-[#1f1f1f]">Уведомления</p>
                <p className="mt-1 text-sm text-[#8a8a8a]">Всё, что требует внимания по вашим обращениям.</p>
              </div>
              <button type="button" className="btn shrink-0" onClick={() => setNotificationsDrawerOpen(false)}>
                Закрыть
              </button>
            </div>

            <div className="flex flex-col items-stretch gap-3 border-b border-[#ececec] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="whitespace-nowrap text-sm text-[#5f5f5f]">Непрочитано: <span className="font-semibold text-[#1f1f1f]">{unreadCount}</span></p>
              <button
                type="button"
                className="btn w-full sm:w-auto"
                onClick={() => void markAllRead()}
                disabled={markingAllRead || unreadCount === 0 || !notificationsReady}
              >
                {markingAllRead ? 'Отмечаем...' : 'Отметить всё прочитанным'}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
              {loadingNotifications ? (
                <p className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] px-3 py-4 text-sm text-[#6b6b6b]">Загружаем уведомления...</p>
              ) : notificationsError ? (
                <p className="rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-4 text-sm text-[#b23b3b]">{notificationsError}</p>
              ) : sortedNotifications.length === 0 ? (
                <p className="rounded-[12px] border border-dashed border-[#dddddd] bg-[#fcfcfc] px-3 py-4 text-sm text-[#6b6b6b]">Пока уведомлений нет.</p>
              ) : (
                <div className="space-y-3">
                  {sortedNotifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className={`w-full rounded-[14px] border px-3 py-3 text-left transition-colors sm:px-4 ${
                        notification.isRead
                          ? 'border-[#e3e3e3] bg-white'
                          : 'border-[#d8dfef] bg-[#f8faff]'
                      }`}
                      onClick={() => void openNotificationTask(notification)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold leading-5 text-[#1f1f1f] [overflow-wrap:anywhere]">{getNotificationTitle(notification)}</p>
                          <p className="mt-1 break-words text-sm leading-5 text-[#4f4f4f] [overflow-wrap:anywhere]">{getNotificationMessage(notification)}</p>
                          {getSafeNotificationReason(notification) && user?.role === 'ADMIN' && (
                            <p className="mt-2 break-words rounded-[8px] border border-[#f0dcb8] bg-[#fff7ea] px-2 py-1 text-xs leading-5 text-[#8a5b14] [overflow-wrap:anywhere]">
                              Причина: {getSafeNotificationReason(notification)}
                            </p>
                          )}
                          <p className="mt-2 text-xs text-[#8a8a8a]">{formatDateTime(notification.createdAt)}</p>
                        </div>
                        {!notification.isRead && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#2f2f2f]" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1440px] px-3 pb-6 pt-3 sm:px-4 sm:pt-4">{children}</main>
    </div>
  );
};
