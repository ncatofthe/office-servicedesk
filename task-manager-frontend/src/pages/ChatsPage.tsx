import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Ticket,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { chatsApi, commentsApi, tasksApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { DataState } from '../components/ui/DataState';
import { Modal } from '../components/ui/Modal';
import { formatDateTime, getInitials } from '../utils';
import type {
  ChatMessage,
  ChatThread,
  ChatUser,
  TaskComment,
  TaskSummary,
} from '../types';

type ChatFilter = 'all' | 'direct' | 'department' | 'ticket';
type Selection = { type: 'chat' | 'ticket'; id: string };

const CHAT_FILTERS: Array<{ key: ChatFilter; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: 'all', label: 'Все', icon: MessageCircle },
  { key: 'direct', label: 'Личные', icon: UserRound },
  { key: 'department', label: 'Отделы', icon: Building2 },
  { key: 'ticket', label: 'Заявки', icon: Ticket },
];

const getDirectPeer = (chat: ChatThread, currentUserId?: string) =>
  chat.members.find((member) => member.userId !== currentUserId)?.user;

const getChatTitle = (chat: ChatThread, currentUserId?: string) => {
  if (chat.kind === 'DEPARTMENT') {
    return chat.department?.name || chat.title || 'Чат отдела';
  }
  return getDirectPeer(chat, currentUserId)?.name || 'Личный чат';
};

const getChatSubtitle = (chat: ChatThread, currentUserId?: string) => {
  if (chat.lastMessage) {
    const prefix = chat.lastMessage.authorId === currentUserId ? 'Вы: ' : '';
    return `${prefix}${chat.lastMessage.content}`;
  }
  return chat.kind === 'DEPARTMENT'
    ? `${chat.members.length} участников`
    : (getDirectPeer(chat, currentUserId)?.position || 'Начните переписку');
};

const getTaskDisplayNumber = (task: TaskSummary) =>
  task.ticketNumber ? `#${task.ticketNumber}` : `#${task.id.slice(-6).toUpperCase()}`;

const getStatusLabel = (status?: string) => ({
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  DONE: 'Закрыта',
  MERGED: 'Объединена',
}[String(status || '').toUpperCase()] || status || 'Заявка');

const getApiError = (error: unknown, fallback: string) => {
  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error || response?.data?.message || fallback;
};

export const ChatsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [tickets, setTickets] = useState<TaskSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ticketMessages, setTicketMessages] = useState<TaskComment[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [creatingDirect, setCreatingDirect] = useState(false);

  const selectedChat = selection?.type === 'chat'
    ? threads.find((chat) => chat.id === selection.id) || null
    : null;
  const selectedTicket = selection?.type === 'ticket'
    ? tickets.find((task) => task.id === selection.id) || null
    : null;

  const loadLists = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setLoading(true);
    }
    try {
      const [chatResult, userResult, ticketResult] = await Promise.allSettled([
        chatsApi.getAll(),
        chatsApi.getUsers(),
        tasksApi.getAll({ limit: 100, sortBy: 'updated', sortOrder: 'desc' }),
      ]);

      if (chatResult.status === 'fulfilled') {
        setThreads(chatResult.value);
      }
      if (userResult.status === 'fulfilled') {
        setUsers(userResult.value);
      }
      if (ticketResult.status === 'fulfilled') {
        setTickets(ticketResult.value.tasks);
      }
      if (chatResult.status === 'rejected' && ticketResult.status === 'rejected') {
        throw chatResult.reason;
      }
    } catch (loadError) {
      setError(getApiError(loadError, 'Не удалось загрузить чаты.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversation = useCallback(async (current: Selection, showLoader = false) => {
    if (showLoader) {
      setMessagesLoading(true);
    }
    try {
      if (current.type === 'chat') {
        const data = await chatsApi.getMessages(current.id, { limit: 200 });
        setMessages(data);
        setThreads((items) => items.map((item) => (
          item.id === current.id ? { ...item, unreadCount: 0 } : item
        )));
      } else {
        setTicketMessages(await commentsApi.getByTask(current.id));
      }
      setError('');
    } catch (loadError) {
      setError(getApiError(loadError, 'Не удалось загрузить переписку.'));
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLists(true);
  }, [loadLists]);

  useEffect(() => {
    if (!selection) {
      return;
    }
    void loadConversation(selection, true);
  }, [loadConversation, selection]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadLists();
      if (selection) {
        void loadConversation(selection);
      }
    }, 12000);
    return () => window.clearInterval(timer);
  }, [loadConversation, loadLists, selection]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, ticketMessages, messagesLoading]);

  const filteredThreads = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (filter === 'ticket') {
      return [];
    }
    return threads.filter((chat) => {
      if (filter === 'direct' && chat.kind !== 'DIRECT') return false;
      if (filter === 'department' && chat.kind !== 'DEPARTMENT') return false;
      const peer = getDirectPeer(chat, user?.id);
      return !normalized || [
        getChatTitle(chat, user?.id),
        peer?.email,
        chat.lastMessage?.content,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [filter, search, threads, user?.id]);

  const filteredTickets = useMemo(() => {
    if (filter !== 'ticket' && filter !== 'all') {
      return [];
    }
    const normalized = search.trim().toLowerCase();
    return tickets.filter((task) => !normalized || [
      task.title,
      String(task.ticketNumber || ''),
      task.author?.name,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized)));
  }, [filter, search, tickets]);

  useEffect(() => {
    if (selection) {
      return;
    }
    const firstChat = filteredThreads[0];
    const firstTicket = filteredTickets[0];
    if (firstChat) {
      setSelection({ type: 'chat', id: firstChat.id });
    } else if (firstTicket) {
      setSelection({ type: 'ticket', id: firstTicket.id });
    }
  }, [filteredThreads, filteredTickets, selection]);

  const availableUsers = useMemo(() => {
    const normalized = userSearch.trim().toLowerCase();
    return users.filter((candidate) => !normalized || [
      candidate.name,
      candidate.email,
      candidate.position,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized)));
  }, [userSearch, users]);

  const startDirect = async (targetUserId: string) => {
    setCreatingDirect(true);
    setError('');
    try {
      const chat = await chatsApi.createDirect(targetUserId);
      setThreads((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setSelection({ type: 'chat', id: chat.id });
      setFilter('direct');
      setNewChatOpen(false);
      setUserSearch('');
    } catch (createError) {
      setError(getApiError(createError, 'Не удалось создать личный чат.'));
    } finally {
      setCreatingDirect(false);
    }
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!selection || !content || sending) {
      return;
    }
    setSending(true);
    setError('');
    try {
      if (selection.type === 'chat') {
        const message = await chatsApi.sendMessage(selection.id, content);
        setMessages((current) => [...current, message]);
      } else {
        const comment = await commentsApi.create(selection.id, { content, visibility: 'PUBLIC' });
        setTicketMessages((current) => [...current, comment]);
      }
      setDraft('');
      await loadLists();
    } catch (sendError) {
      setError(getApiError(sendError, 'Не удалось отправить сообщение.'));
    } finally {
      setSending(false);
    }
  };

  const editInternalMessage = async (message: ChatMessage) => {
    const content = window.prompt('Изменить сообщение', message.content)?.trim();
    if (!content || content === message.content || !selectedChat) return;
    try {
      const updated = await chatsApi.updateMessage(selectedChat.id, message.id, content);
      setMessages((current) => current.map((item) => item.id === message.id ? updated : item));
    } catch (editError) {
      setError(getApiError(editError, 'Не удалось изменить сообщение.'));
    }
  };

  const deleteInternalMessage = async (message: ChatMessage) => {
    if (!selectedChat || !window.confirm('Удалить это сообщение?')) return;
    try {
      await chatsApi.deleteMessage(selectedChat.id, message.id);
      setMessages((current) => current.filter((item) => item.id !== message.id));
      await loadLists();
    } catch (deleteError) {
      setError(getApiError(deleteError, 'Не удалось удалить сообщение.'));
    }
  };

  const editTicketMessage = async (message: TaskComment) => {
    const content = window.prompt('Изменить сообщение', message.content)?.trim();
    if (!content || content === message.content) return;
    try {
      const updated = await commentsApi.update(message.id, content);
      setTicketMessages((current) => current.map((item) => item.id === message.id ? updated : item));
    } catch (editError) {
      setError(getApiError(editError, 'Не удалось изменить сообщение.'));
    }
  };

  const deleteTicketMessage = async (message: TaskComment) => {
    if (!window.confirm('Удалить это сообщение из заявки?')) return;
    try {
      await commentsApi.delete(message.id);
      setTicketMessages((current) => current.filter((item) => item.id !== message.id));
    } catch (deleteError) {
      setError(getApiError(deleteError, 'Не удалось удалить сообщение.'));
    }
  };

  const currentTitle = selectedChat
    ? getChatTitle(selectedChat, user?.id)
    : selectedTicket
      ? `${getTaskDisplayNumber(selectedTicket)} · ${selectedTicket.title}`
      : '';
  const currentSubtitle = selectedChat
    ? (selectedChat.kind === 'DEPARTMENT'
      ? `Общий чат отдела · ${selectedChat.members.length} участников`
      : (getDirectPeer(selectedChat, user?.id)?.position || getDirectPeer(selectedChat, user?.id)?.email || 'Личная переписка'))
    : selectedTicket
      ? `${getStatusLabel(selectedTicket.status)} · сообщения сохраняются в заявке`
      : '';
  const canSend = selection?.type === 'chat' || user?.role !== 'VIEWER';

  return (
    <div className="space-y-4" data-testid="chats-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Чаты</h1>
          <p className="page-subtitle mt-1">Личные сообщения, отделы и переписка по заявкам — в одном месте.</p>
        </div>
        <button type="button" className="btn btn-primary inline-flex items-center gap-2" onClick={() => setNewChatOpen(true)}>
          <Plus size={16} />
          Новый чат
        </button>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f3333]">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Закрыть"><X size={16} /></button>
        </div>
      )}

      <div className="card h-[calc(100dvh-300px)] min-h-[520px] overflow-hidden p-0 md:h-auto md:min-h-[680px]">
        <div className="grid h-full min-h-0 md:min-h-[680px] md:grid-cols-[340px,minmax(0,1fr)]">
          <aside className={`${selection ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r border-[#e7e7e7] bg-[#fbfbfb]`}>
            <div className="border-b border-[#e7e7e7] p-3">
              <div className="flex gap-1 overflow-x-auto pb-2">
                {CHAT_FILTERS.map((item) => {
                  const Icon = item.icon;
                  const active = filter === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setFilter(item.key);
                        setSelection(null);
                      }}
                      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] border px-2.5 text-xs font-medium ${
                        active
                          ? 'border-[#2f2f2f] bg-[#2f2f2f] text-white'
                          : 'border-[#dedede] bg-white text-[#555]'
                      }`}
                    >
                      <Icon size={14} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#969696]" />
                <input
                  className="input pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск чатов и заявок"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? (
                <DataState variant="loading" message="Загружаем чаты..." />
              ) : filteredThreads.length === 0 && filteredTickets.length === 0 ? (
                <DataState variant="empty" message="Здесь пока нет переписок. Начните личный чат или откройте заявку." />
              ) : (
                <div className="space-y-1">
                  {filteredThreads.map((chat) => {
                    const active = selection?.type === 'chat' && selection.id === chat.id;
                    const peer = getDirectPeer(chat, user?.id);
                    const title = getChatTitle(chat, user?.id);
                    return (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => setSelection({ type: 'chat', id: chat.id })}
                        className={`w-full rounded-[12px] p-3 text-left transition ${
                          active ? 'bg-[#eeeeeb]' : 'hover:bg-[#f2f2f2]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                            chat.kind === 'DEPARTMENT' ? 'bg-[#e6ecee] text-[#45575e]' : 'bg-[#2f2f2f] text-white'
                          }`}>
                            {chat.kind === 'DEPARTMENT' ? <Users size={17} /> : getInitials(peer?.name || title)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-[#242424]">{title}</p>
                              {chat.unreadCount > 0 && (
                                <span className="ml-auto flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#2f2f2f] px-1.5 text-[10px] text-white">
                                  {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-[#858585]">{getChatSubtitle(chat, user?.id)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {filteredTickets.length > 0 && (
                    <div className="pt-2">
                      {filter === 'all' && (
                        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#999]">По заявкам</p>
                      )}
                      {filteredTickets.map((task) => {
                        const active = selection?.type === 'ticket' && selection.id === task.id;
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => setSelection({ type: 'ticket', id: task.id })}
                            className={`w-full rounded-[12px] p-3 text-left transition ${
                              active ? 'bg-[#eeeeeb]' : 'hover:bg-[#f2f2f2]'
                            }`}
                          >
                            <div className="flex gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f0eadf] text-[#675b47]">
                                <Ticket size={17} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#242424]">
                                  {getTaskDisplayNumber(task)} · {task.title}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-[#858585]">
                                  {getStatusLabel(task.status)} · {task.author?.name}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>

          <section className={`${selection ? 'flex' : 'hidden md:flex'} min-w-0 flex-col bg-white`}>
            {!selection ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="max-w-sm text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f0f0ed] text-[#454545]">
                    <MessageCircle size={24} />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-[#252525]">Выберите переписку</h2>
                  <p className="mt-2 text-sm leading-6 text-[#777]">Можно написать сотруднику, открыть чат отдела или ответить прямо по заявке.</p>
                </div>
              </div>
            ) : (
              <>
                <header className="flex min-h-[72px] items-center gap-3 border-b border-[#e7e7e7] px-3 py-3 sm:px-5">
                  <button
                    type="button"
                    className="btn h-10 w-10 shrink-0 p-0 md:hidden"
                    onClick={() => setSelection(null)}
                    aria-label="Назад к чатам"
                  >
                    <ArrowLeft size={17} className="mx-auto" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-[#222]">{currentTitle}</h2>
                    <p className="truncate text-xs text-[#858585]">{currentSubtitle}</p>
                  </div>
                  {selectedTicket && (
                    <button
                      type="button"
                      className="btn inline-flex items-center gap-2"
                      onClick={() => navigate(`/tickets?taskId=${selectedTicket.id}`)}
                    >
                      <ExternalLink size={15} />
                      <span className="hidden sm:inline">Открыть заявку</span>
                    </button>
                  )}
                  {selectedChat && (
                    <button type="button" className="btn h-10 w-10 p-0" title="Информация о чате" aria-label="Информация о чате">
                      <MoreHorizontal size={18} className="mx-auto" />
                    </button>
                  )}
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f8f6] px-3 py-5 sm:px-6">
                  {messagesLoading ? (
                    <DataState variant="loading" message="Загружаем сообщения..." />
                  ) : selection.type === 'chat' ? (
                    messages.length === 0 ? (
                      <DataState variant="empty" message="Сообщений пока нет. Начните разговор — достаточно пары слов." />
                    ) : (
                      <div className="mx-auto max-w-3xl space-y-3">
                        {messages.map((message) => {
                          const own = message.authorId === user?.id;
                          return (
                            <div key={message.id} className={`group flex ${own ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[86%] sm:max-w-[72%] ${own ? 'items-end' : 'items-start'} flex flex-col`}>
                                {!own && <p className="mb-1 px-1 text-xs font-medium text-[#686868]">{message.author.name}</p>}
                                <div className={`rounded-[16px] px-4 py-2.5 shadow-sm ${
                                  own
                                    ? 'rounded-br-[5px] bg-[#2f2f2f] text-white'
                                    : 'rounded-bl-[5px] border border-[#e4e4e2] bg-white text-[#292929]'
                                }`}>
                                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                                  <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-white/60' : 'text-[#999]'}`}>
                                    {message.editedAt && <span>изменено ·</span>}
                                    <span>{formatDateTime(message.createdAt)}</span>
                                  </div>
                                </div>
                                {own && (
                                  <div className="mt-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                    <button type="button" className="rounded p-1 text-[#888] hover:bg-white hover:text-[#333]" onClick={() => void editInternalMessage(message)} title="Изменить">
                                      <Pencil size={13} />
                                    </button>
                                    <button type="button" className="rounded p-1 text-[#a56a6a] hover:bg-white hover:text-[#9f3333]" onClick={() => void deleteInternalMessage(message)} title="Удалить">
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )
                  ) : ticketMessages.length === 0 ? (
                    <DataState variant="empty" message="В этой заявке пока нет сообщений. Ваш ответ появится и здесь, и в карточке заявки." />
                  ) : (
                    <div className="mx-auto max-w-3xl space-y-3">
                      {ticketMessages.map((message) => {
                        const own = message.authorId === user?.id;
                        const canManage = own || user?.role === 'ADMIN';
                        return (
                          <div key={message.id} className={`group flex ${own ? 'justify-end' : 'justify-start'}`}>
                            <div className="flex max-w-[86%] flex-col sm:max-w-[72%]">
                              {!own && <p className="mb-1 px-1 text-xs font-medium text-[#686868]">{message.author?.name || 'Участник'}</p>}
                              <div className={`rounded-[16px] px-4 py-2.5 shadow-sm ${
                                own
                                  ? 'rounded-br-[5px] bg-[#2f2f2f] text-white'
                                  : 'rounded-bl-[5px] border border-[#e4e4e2] bg-white text-[#292929]'
                              }`}>
                                <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                                <div className={`mt-1 flex items-center justify-end gap-2 text-[10px] ${own ? 'text-white/60' : 'text-[#999]'}`}>
                                  {message.visibility === 'INTERNAL' && <span>внутренняя заметка</span>}
                                  <span>{formatDateTime(message.createdAt)}</span>
                                </div>
                              </div>
                              {canManage && (
                                <div className={`mt-1 flex gap-1 ${own ? 'justify-end' : 'justify-start'} opacity-100 sm:opacity-0 sm:group-hover:opacity-100`}>
                                  {own && (
                                    <button type="button" className="rounded p-1 text-[#888] hover:bg-white hover:text-[#333]" onClick={() => void editTicketMessage(message)} title="Изменить">
                                      <Pencil size={13} />
                                    </button>
                                  )}
                                  <button type="button" className="rounded p-1 text-[#a56a6a] hover:bg-white hover:text-[#9f3333]" onClick={() => void deleteTicketMessage(message)} title="Удалить">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                <div className="border-t border-[#e7e7e7] bg-white p-3 sm:p-4">
                  {canSend ? (
                    <div className="mx-auto flex max-w-3xl items-end gap-2">
                      <textarea
                        className="input max-h-36 min-h-[46px] flex-1 resize-none py-3"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void sendMessage();
                          }
                        }}
                        placeholder={selectedTicket ? 'Ответить по заявке…' : 'Написать сообщение…'}
                        disabled={sending}
                      />
                      <button
                        type="button"
                        className="btn btn-primary flex h-[46px] w-[46px] shrink-0 items-center justify-center p-0"
                        onClick={() => void sendMessage()}
                        disabled={sending || !draft.trim()}
                        aria-label="Отправить сообщение"
                      >
                        <Send size={17} />
                      </button>
                    </div>
                  ) : (
                    <p className="text-center text-sm text-[#858585]">У вашей роли есть доступ только к чтению переписки по заявке.</p>
                  )}
                  {selectedTicket && (
                    <p className="mx-auto mt-2 max-w-3xl text-xs text-[#969696]">
                      Ответ будет сохранён как публичное сообщение в заявке. Shift + Enter — новая строка.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <Modal open={newChatOpen} onClose={() => !creatingDirect && setNewChatOpen(false)} title="Новый личный чат" testId="new-direct-chat-modal">
        <div className="space-y-3">
          <p className="text-sm leading-6 text-[#6b6b6b]">Выберите сотрудника. Существующая переписка откроется автоматически, новая не продублируется.</p>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#969696]" />
            <input
              className="input pl-9"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Имя, почта или должность"
              autoFocus
            />
          </div>
          <div className="max-h-[360px] space-y-1 overflow-y-auto">
            {availableUsers.length === 0 ? (
              <DataState variant="empty" message="Подходящих пользователей не найдено." />
            ) : availableUsers.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-[11px] border border-transparent p-3 text-left hover:border-[#dedede] hover:bg-[#fafafa]"
                onClick={() => void startDirect(candidate.id)}
                disabled={creatingDirect}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2f2f2f] text-sm font-semibold text-white">
                  {getInitials(candidate.name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#252525]">{candidate.name}</p>
                  <p className="truncate text-xs text-[#888]">{candidate.position || candidate.email}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};
