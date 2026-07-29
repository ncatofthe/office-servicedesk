import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Download,
  ExternalLink,
  FileText,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings2,
  Ticket,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { chatsApi, commentsApi, filesApi, tasksApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { DataState } from '../components/ui/DataState';
import { Modal } from '../components/ui/Modal';
import { formatDateTime, getInitials } from '../utils';
import type {
  ChatAttachment,
  ChatMessage,
  ChatSettings,
  ChatThread,
  ChatUser,
  TaskAttachment,
  TaskComment,
  TaskSummary,
  TicketChatMember,
} from '../types';

type ChatFilter = 'all' | 'direct' | 'department' | 'ticket';
type Selection = { type: 'chat' | 'ticket'; id: string };
type ConversationItem =
  | { type: 'chat'; id: string; timestamp: string; chat: ChatThread }
  | { type: 'ticket'; id: string; timestamp: string; task: TaskSummary };
type TicketTimelineItem =
  | { type: 'message'; id: string; createdAt: string; message: TaskComment }
  | { type: 'file'; id: string; createdAt: string; file: TaskAttachment };

const FILTERS: Array<{ key: ChatFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'direct', label: 'Люди' },
  { key: 'department', label: 'Отделы' },
  { key: 'ticket', label: 'Заявки' },
];

const DEFAULT_SETTINGS: ChatSettings = {
  id: 'default',
  chatsEnabled: true,
  directChatsEnabled: true,
  departmentChatsEnabled: true,
  ticketChatsEnabled: true,
  attachmentsEnabled: true,
  maxAttachmentSizeMb: 25,
  createdAt: '',
  updatedAt: '',
};

const getApiError = (error: unknown, fallback: string) => {
  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error || response?.data?.message || fallback;
};

const getTaskNumber = (task: TaskSummary) =>
  task.ticketNumber ? `#${task.ticketNumber}` : `#${task.id.slice(-6).toUpperCase()}`;

const getStatusLabel = (status?: string) => ({
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  REVIEW: 'На проверке',
  DONE: 'Закрыта',
  MERGED: 'Объединена',
}[String(status || '').toUpperCase()] || status || 'Заявка');

const getDirectPeer = (chat: ChatThread, currentUserId?: string) =>
  chat.members.find((member) => member.userId !== currentUserId)?.user;

const getChatTitle = (chat: ChatThread, currentUserId?: string) => {
  if (chat.kind === 'DEPARTMENT') {
    return chat.department?.name || chat.title || 'Чат отдела';
  }
  if (chat.kind === 'GROUP') {
    return chat.title || chat.members
      .filter((member) => member.userId !== currentUserId)
      .map((member) => member.user.name)
      .slice(0, 3)
      .join(', ') || 'Групповой чат';
  }
  return getDirectPeer(chat, currentUserId)?.name || 'Личный чат';
};

const getChatKindLabel = (chat: ChatThread) => ({
  DIRECT: 'Личный',
  GROUP: 'Группа',
  DEPARTMENT: 'Отдел',
}[chat.kind]);

const getChatPreview = (chat: ChatThread, currentUserId?: string) => {
  const message = chat.lastMessage;
  if (!message) {
    return chat.kind === 'DEPARTMENT'
      ? `${chat.members.length} участников`
      : 'Начните переписку';
  }
  const attachmentText = message.attachments?.length
    ? `📎 ${message.attachments[0].filename}`
    : '';
  const content = message.content || attachmentText;
  return `${message.authorId === currentUserId ? 'Вы: ' : ''}${content}`;
};

const getConversationIcon = (item: ConversationItem) => {
  if (item.type === 'ticket') return Ticket;
  if (item.chat.kind === 'DEPARTMENT') return Building2;
  if (item.chat.kind === 'GROUP') return Users;
  return UserRound;
};

const formatFileSize = (size?: number | null) => {
  if (!size) return '';
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`;
  return `${(size / 1024 / 1024).toFixed(size > 10 * 1024 * 1024 ? 0 : 1)} МБ`;
};

const getDayLabel = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (target === today) return 'Сегодня';
  if (target === today - 86400000) return 'Вчера';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
};

const sameDay = (left?: string, right?: string) => {
  if (!left || !right) return false;
  return new Date(left).toDateString() === new Date(right).toDateString();
};

export const ChatsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [tickets, setTickets] = useState<TaskSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ticketMessages, setTicketMessages] = useState<TaskComment[]>([]);
  const [ticketFiles, setTicketFiles] = useState<TaskAttachment[]>([]);
  const [ticketMembers, setTicketMembers] = useState<TicketChatMember[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [participantSearch, setParticipantSearch] = useState('');
  const [creatingDirect, setCreatingDirect] = useState(false);
  const [participantSaving, setParticipantSaving] = useState(false);

  const selectedChat = selection?.type === 'chat'
    ? threads.find((chat) => chat.id === selection.id) || null
    : null;
  const selectedTicket = selection?.type === 'ticket'
    ? tickets.find((task) => task.id === selection.id) || null
    : null;

  const loadLists = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const currentSettings = await chatsApi.getSettings();
      setSettings(currentSettings);
      if (!currentSettings.chatsEnabled) {
        setThreads([]);
        setTickets([]);
        setLoading(false);
        return;
      }

      const [chatResult, userResult, ticketResult] = await Promise.allSettled([
        currentSettings.directChatsEnabled || currentSettings.departmentChatsEnabled
          ? chatsApi.getAll()
          : Promise.resolve([]),
        chatsApi.getUsers(),
        currentSettings.ticketChatsEnabled
          ? tasksApi.getAll({ limit: 100, sortBy: 'updated', sortOrder: 'desc' })
          : Promise.resolve({ tasks: [], total: 0, limit: 100, offset: 0 }),
      ]);

      if (chatResult.status === 'fulfilled') setThreads(chatResult.value);
      if (userResult.status === 'fulfilled') setUsers(userResult.value);
      if (ticketResult.status === 'fulfilled') setTickets(ticketResult.value.tasks);
      if (chatResult.status === 'rejected' && ticketResult.status === 'rejected') {
        throw chatResult.reason;
      }
      setError('');
    } catch (loadError) {
      setError(getApiError(loadError, 'Не удалось загрузить диалоги.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversation = useCallback(async (current: Selection, showLoader = false) => {
    if (showLoader) setMessagesLoading(true);
    try {
      if (current.type === 'chat') {
        setMessages(await chatsApi.getMessages(current.id, { limit: 200 }));
        setThreads((items) => items.map((item) => (
          item.id === current.id ? { ...item, unreadCount: 0 } : item
        )));
      } else {
        const [comments, files, members] = await Promise.all([
          commentsApi.getByTask(current.id),
          filesApi.getTaskFiles(current.id),
          chatsApi.getTicketMembers(current.id),
        ]);
        setTicketMessages(comments);
        setTicketFiles(files);
        setTicketMembers(members);
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
    setDraft('');
    setSelectedFile(null);
    if (selection) void loadConversation(selection, true);
  }, [loadConversation, selection]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadLists();
      if (selection) void loadConversation(selection);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadConversation, loadLists, selection]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, ticketMessages, ticketFiles, messagesLoading]);

  const conversationItems = useMemo<ConversationItem[]>(() => {
    const normalized = search.trim().toLowerCase();
    const chatItems: ConversationItem[] = threads
      .filter((chat) => {
        if (filter === 'ticket') return false;
        if (filter === 'direct' && !['DIRECT', 'GROUP'].includes(chat.kind)) return false;
        if (filter === 'department' && chat.kind !== 'DEPARTMENT') return false;
        const title = getChatTitle(chat, user?.id);
        return !normalized || [
          title,
          getChatPreview(chat, user?.id),
          ...chat.members.map((member) => member.user.email),
        ].some((value) => value.toLowerCase().includes(normalized));
      })
      .map((chat) => ({ type: 'chat', id: chat.id, timestamp: chat.updatedAt, chat }));

    const ticketItems: ConversationItem[] = tickets
      .filter((task) => {
        if (filter !== 'all' && filter !== 'ticket') return false;
        return !normalized || [
          task.title,
          String(task.ticketNumber || ''),
          task.author?.name || '',
        ].some((value) => value.toLowerCase().includes(normalized));
      })
      .map((task) => ({ type: 'ticket', id: task.id, timestamp: task.updatedAt, task }));

    return [...chatItems, ...ticketItems].sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    );
  }, [filter, search, threads, tickets, user?.id]);

  useEffect(() => {
    if (!selection && conversationItems[0]) {
      setSelection({ type: conversationItems[0].type, id: conversationItems[0].id });
    }
  }, [conversationItems, selection]);

  const ticketTimeline = useMemo<TicketTimelineItem[]>(() => [
    ...ticketMessages.map((message) => ({
      type: 'message' as const,
      id: message.id,
      createdAt: message.createdAt,
      message,
    })),
    ...ticketFiles.map((file) => ({
      type: 'file' as const,
      id: file.id,
      createdAt: file.createdAt,
      file,
    })),
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()), [ticketFiles, ticketMessages]);

  const currentMembers = selectedChat
    ? selectedChat.members.map((member) => ({ userId: member.userId, user: member.user, role: 'PARTICIPANT' as const }))
    : ticketMembers;
  const currentMemberIds = new Set(currentMembers.map((member) => member.userId));

  const availableUsers = useMemo(() => {
    const normalized = userSearch.trim().toLowerCase();
    return users.filter((candidate) => !normalized || [
      candidate.name,
      candidate.email,
      candidate.position || '',
    ].some((value) => value.toLowerCase().includes(normalized)));
  }, [userSearch, users]);

  const availableParticipants = useMemo(() => {
    const normalized = participantSearch.trim().toLowerCase();
    return users.filter((candidate) => !currentMemberIds.has(candidate.id) && (!normalized || [
      candidate.name,
      candidate.email,
      candidate.position || '',
    ].some((value) => value.toLowerCase().includes(normalized))));
  }, [currentMemberIds, participantSearch, users]);

  const startDirect = async (targetUserId: string) => {
    setCreatingDirect(true);
    try {
      const chat = await chatsApi.createDirect(targetUserId);
      setThreads((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setSelection({ type: 'chat', id: chat.id });
      setFilter('direct');
      setNewChatOpen(false);
      setUserSearch('');
    } catch (createError) {
      setError(getApiError(createError, 'Не удалось создать диалог.'));
    } finally {
      setCreatingDirect(false);
    }
  };

  const addParticipant = async (targetUserId: string) => {
    if (!selection) return;
    setParticipantSaving(true);
    try {
      if (selection.type === 'chat') {
        const updated = await chatsApi.addMember(selection.id, targetUserId);
        setThreads((current) => current.map((item) => item.id === updated.id ? updated : item));
      } else {
        setTicketMembers(await chatsApi.addTicketMember(selection.id, targetUserId));
      }
      setParticipantSearch('');
    } catch (addError) {
      setError(getApiError(addError, 'Не удалось добавить участника.'));
    } finally {
      setParticipantSaving(false);
    }
  };

  const removeParticipant = async (targetUserId: string) => {
    if (!selection || !window.confirm('Убрать участника из переписки?')) return;
    setParticipantSaving(true);
    try {
      if (selection.type === 'chat') {
        await chatsApi.removeMember(selection.id, targetUserId);
        await loadLists();
        if (targetUserId === user?.id) {
          setMembersOpen(false);
          setSelection(null);
        }
      } else {
        setTicketMembers(await chatsApi.removeTicketMember(selection.id, targetUserId));
      }
    } catch (removeError) {
      setError(getApiError(removeError, 'Не удалось удалить участника.'));
    } finally {
      setParticipantSaving(false);
    }
  };

  const chooseFile = (file?: File) => {
    if (!file) return;
    if (!settings.attachmentsEnabled) {
      setError('Администратор отключил вложения в чатах.');
      return;
    }
    if (file.size > settings.maxAttachmentSizeMb * 1024 * 1024) {
      setError(`Файл превышает лимит ${settings.maxAttachmentSizeMb} МБ.`);
      return;
    }
    setSelectedFile(file);
    setError('');
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!selection || sending || (!content && !selectedFile)) return;
    setSending(true);
    setError('');
    try {
      if (selection.type === 'chat') {
        const message = selectedFile
          ? await chatsApi.sendAttachment(selection.id, selectedFile, content)
          : await chatsApi.sendMessage(selection.id, content);
        setMessages((current) => [...current, message]);
      } else {
        if (selectedFile) {
          const file = await filesApi.uploadTaskFile(selection.id, selectedFile);
          setTicketFiles((current) => [...current, file]);
        }
        if (content) {
          const comment = await commentsApi.create(selection.id, { content, visibility: 'PUBLIC' });
          setTicketMessages((current) => [...current, comment]);
        }
      }
      setDraft('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadLists();
    } catch (sendError) {
      setError(getApiError(sendError, 'Не удалось отправить сообщение или файл.'));
    } finally {
      setSending(false);
    }
  };

  const downloadChatAttachment = async (attachment: ChatAttachment) => {
    try {
      await chatsApi.downloadAttachment(attachment.id, attachment.filename);
    } catch (downloadError) {
      setError(getApiError(downloadError, 'Не удалось скачать файл.'));
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
    if (!selectedChat || !window.confirm('Удалить сообщение и его вложения?')) return;
    try {
      await chatsApi.deleteMessage(selectedChat.id, message.id);
      setMessages((current) => current.filter((item) => item.id !== message.id));
    } catch (deleteError) {
      setError(getApiError(deleteError, 'Не удалось удалить сообщение.'));
    }
  };

  const currentTitle = selectedChat
    ? getChatTitle(selectedChat, user?.id)
    : selectedTicket
      ? `${getTaskNumber(selectedTicket)} · ${selectedTicket.title}`
      : '';
  const currentKind = selectedChat
    ? getChatKindLabel(selectedChat)
    : selectedTicket ? 'Заявка' : '';
  const currentSubtitle = selectedChat
    ? `${selectedChat.members.length} ${selectedChat.members.length === 1 ? 'участник' : 'участника'}`
    : selectedTicket
      ? `${getStatusLabel(selectedTicket.status)} · ${ticketMembers.length || 1} участников`
      : '';
  const canSend = selection?.type === 'chat' || user?.role !== 'VIEWER';

  if (!loading && !settings.chatsEnabled) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="page-title">Сообщения</h1>
          <p className="page-subtitle mt-1">Рабочие переписки и чаты заявок.</p>
        </div>
        <div className="card p-8">
          <DataState variant="empty" message="Раздел чатов временно отключён администратором." />
          {user?.role === 'ADMIN' && (
            <div className="mt-4 flex justify-center">
              <button type="button" className="btn btn-primary inline-flex items-center gap-2" onClick={() => navigate('/admin')}>
                <Settings2 size={16} />
                Открыть настройки
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="chats-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Сообщения</h1>
          <p className="page-subtitle mt-1">Сотрудники, отделы и заявки — в одной рабочей ленте.</p>
        </div>
        {settings.directChatsEnabled && (
          <button type="button" className="btn btn-primary inline-flex items-center gap-2" onClick={() => setNewChatOpen(true)}>
            <Plus size={16} />
            Новый диалог
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f3333]">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Закрыть"><X size={16} /></button>
        </div>
      )}

      <div className="card h-[calc(100dvh-270px)] min-h-[560px] overflow-hidden p-0 md:h-[720px]">
        <div className="grid h-full min-h-0 md:grid-cols-[330px,minmax(0,1fr)]">
          <aside className={`${selection ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r border-[#e3e3e3] bg-white`}>
            <div className="border-b border-[#e8e8e8] p-3">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#969696]" />
                <input
                  className="input h-11 pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск переписок"
                />
              </div>
              <div className="mt-2 flex gap-1 overflow-x-auto">
                {FILTERS.filter((item) => (
                  item.key === 'all'
                  || (item.key === 'direct' && settings.directChatsEnabled)
                  || (item.key === 'department' && settings.departmentChatsEnabled)
                  || (item.key === 'ticket' && settings.ticketChatsEnabled)
                )).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setFilter(item.key);
                      setSelection(null);
                    }}
                    className={`h-8 shrink-0 rounded-[8px] px-2.5 text-xs font-medium transition ${
                      filter === item.key ? 'bg-[#2f2f2f] text-white' : 'text-[#686868] hover:bg-[#f0f0ee]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading ? (
                <DataState variant="loading" message="Загружаем диалоги..." />
              ) : conversationItems.length === 0 ? (
                <DataState variant="empty" message="Переписок пока нет. Создайте диалог или откройте чат заявки." />
              ) : (
                <div className="space-y-1">
                  {conversationItems.map((item) => {
                    const active = selection?.type === item.type && selection.id === item.id;
                    const Icon = getConversationIcon(item);
                    const isTicket = item.type === 'ticket';
                    const title = isTicket
                      ? `${getTaskNumber(item.task)} · ${item.task.title}`
                      : getChatTitle(item.chat, user?.id);
                    const preview = isTicket
                      ? `${getStatusLabel(item.task.status)} · ${item.task.author?.name || 'Заявка'}`
                      : getChatPreview(item.chat, user?.id);
                    const unread = !isTicket ? item.chat.unreadCount : 0;
                    return (
                      <button
                        key={`${item.type}:${item.id}`}
                        type="button"
                        onClick={() => setSelection({ type: item.type, id: item.id })}
                        className={`w-full rounded-[13px] p-3 text-left transition ${
                          active ? 'bg-[#ecece9]' : 'hover:bg-[#f5f5f3]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${
                            isTicket
                              ? 'bg-[#f3eadc] text-[#675a45]'
                              : item.chat.kind === 'DEPARTMENT'
                                ? 'bg-[#e6edef] text-[#475d65]'
                                : 'bg-[#2f2f2f] text-white'
                          }`}>
                            {!isTicket && item.chat.kind === 'DIRECT'
                              ? getInitials(getDirectPeer(item.chat, user?.id)?.name || title)
                              : <Icon size={18} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-[#242424]">{title}</p>
                              {unread > 0 && (
                                <span className="ml-auto flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#2f2f2f] px-1.5 text-[10px] text-white">
                                  {unread > 99 ? '99+' : unread}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-[#818181]">{preview}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className={`${selection ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col bg-[#f7f7f5]`}>
            {!selection ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="max-w-sm text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[18px] bg-white text-[#454545] shadow-sm">
                    <MessageCircle size={27} />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-[#252525]">Выберите диалог</h2>
                  <p className="mt-2 text-sm leading-6 text-[#777]">Здесь можно написать сотруднику, обсудить вопрос с отделом или ответить по заявке.</p>
                </div>
              </div>
            ) : (
              <>
                <header className="flex min-h-[76px] items-center gap-3 border-b border-[#e3e3e3] bg-white px-3 py-3 sm:px-5">
                  <button type="button" className="btn h-10 w-10 shrink-0 p-0 md:hidden" onClick={() => setSelection(null)} aria-label="Назад">
                    <ArrowLeft size={17} className="mx-auto" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-[#222]">{currentTitle}</h2>
                      <span className="chip shrink-0">{currentKind}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[#858585]">{currentSubtitle}</p>
                  </div>
                  <button
                    type="button"
                    className="btn inline-flex h-10 items-center gap-2"
                    onClick={() => setMembersOpen(true)}
                    title="Участники переписки"
                  >
                    <UserPlus size={16} />
                    <span className="hidden lg:inline">Участники</span>
                  </button>
                  {selectedTicket && (
                    <button type="button" className="btn inline-flex h-10 items-center gap-2" onClick={() => navigate(`/tickets?taskId=${selectedTicket.id}`)}>
                      <ExternalLink size={15} />
                      <span className="hidden lg:inline">Заявка</span>
                    </button>
                  )}
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
                  {messagesLoading ? (
                    <DataState variant="loading" message="Загружаем переписку..." />
                  ) : selection.type === 'chat' ? (
                    messages.length === 0 ? (
                      <DataState variant="empty" message="В диалоге пока нет сообщений. Напишите первым или прикрепите файл." />
                    ) : (
                      <div className="mx-auto max-w-3xl space-y-2">
                        {messages.map((message, index) => {
                          const own = message.authorId === user?.id;
                          const showDay = index === 0 || !sameDay(messages[index - 1]?.createdAt, message.createdAt);
                          return (
                            <React.Fragment key={message.id}>
                              {showDay && (
                                <div className="flex justify-center py-2">
                                  <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-[#858585] shadow-sm">
                                    {getDayLabel(message.createdAt)}
                                  </span>
                                </div>
                              )}
                              <div className={`group flex items-end gap-2 ${own ? 'justify-end' : 'justify-start'}`}>
                                {!own && (
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#555] shadow-sm">
                                    {getInitials(message.author.name)}
                                  </div>
                                )}
                                <div className={`flex max-w-[84%] flex-col ${own ? 'items-end' : 'items-start'} sm:max-w-[70%]`}>
                                  {!own && <p className="mb-1 px-1 text-xs font-medium text-[#686868]">{message.author.name}</p>}
                                  <div className={`rounded-[18px] px-3.5 py-2.5 shadow-sm ${
                                    own
                                      ? 'rounded-br-[6px] bg-[#2f2f2f] text-white'
                                      : 'rounded-bl-[6px] border border-[#e2e2df] bg-white text-[#292929]'
                                  }`}>
                                    {message.content && <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>}
                                    {message.attachments?.length > 0 && (
                                      <div className={`${message.content ? 'mt-2' : ''} space-y-2`}>
                                        {message.attachments.map((attachment) => (
                                          <button
                                            key={attachment.id}
                                            type="button"
                                            className={`flex w-full min-w-[210px] items-center gap-3 rounded-[12px] border p-2.5 text-left ${
                                              own ? 'border-white/20 bg-white/10 hover:bg-white/15' : 'border-[#e5e5e2] bg-[#f7f7f5] hover:bg-[#f0f0ed]'
                                            }`}
                                            onClick={() => void downloadChatAttachment(attachment)}
                                          >
                                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] ${own ? 'bg-white/15' : 'bg-white'}`}>
                                              <FileText size={17} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                              <span className="block truncate text-sm font-medium">{attachment.filename}</span>
                                              <span className={`block text-[10px] ${own ? 'text-white/55' : 'text-[#929292]'}`}>{formatFileSize(attachment.sizeBytes)}</span>
                                            </span>
                                            <Download size={15} className="shrink-0 opacity-65" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-white/55' : 'text-[#999]'}`}>
                                      {message.editedAt && <span>изменено ·</span>}
                                      <span>{formatDateTime(message.createdAt)}</span>
                                    </div>
                                  </div>
                                  {own && (
                                    <div className="mt-1 flex gap-2 px-1 text-[11px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                      {message.content && <button type="button" onClick={() => void editInternalMessage(message)} className="text-[#7c7c7c] hover:text-[#333]">Изменить</button>}
                                      <button type="button" onClick={() => void deleteInternalMessage(message)} className="text-[#a36b6b] hover:text-[#963737]">Удалить</button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </React.Fragment>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )
                  ) : ticketTimeline.length === 0 ? (
                    <DataState variant="empty" message="В заявке пока нет сообщений и файлов. Ответ появится одновременно здесь и в карточке заявки." />
                  ) : (
                    <div className="mx-auto max-w-3xl space-y-2">
                      {ticketTimeline.map((item, index) => {
                        const own = item.type === 'message'
                          ? item.message.authorId === user?.id
                          : item.file.uploadedById === user?.id;
                        const showDay = index === 0 || !sameDay(ticketTimeline[index - 1]?.createdAt, item.createdAt);
                        return (
                          <React.Fragment key={`${item.type}:${item.id}`}>
                            {showDay && (
                              <div className="flex justify-center py-2">
                                <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-[#858585] shadow-sm">{getDayLabel(item.createdAt)}</span>
                              </div>
                            )}
                            <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[84%] rounded-[18px] px-3.5 py-2.5 shadow-sm sm:max-w-[70%] ${
                                own
                                  ? 'rounded-br-[6px] bg-[#2f2f2f] text-white'
                                  : 'rounded-bl-[6px] border border-[#e2e2df] bg-white text-[#292929]'
                              }`}>
                                {item.type === 'message' ? (
                                  <>
                                    {!own && <p className="mb-1 text-xs font-semibold text-[#696969]">{item.message.author?.name || 'Участник'}</p>}
                                    <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.message.content}</p>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className={`flex min-w-[210px] items-center gap-3 rounded-[12px] border p-2.5 text-left ${
                                      own ? 'border-white/20 bg-white/10' : 'border-[#e5e5e2] bg-[#f7f7f5]'
                                    }`}
                                    onClick={() => void filesApi.downloadTaskFile(item.file.id, item.file.filename)}
                                  >
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] ${own ? 'bg-white/15' : 'bg-white'}`}>
                                      <FileText size={17} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium">{item.file.filename}</span>
                                      <span className={`block text-[10px] ${own ? 'text-white/55' : 'text-[#929292]'}`}>Вложение заявки</span>
                                    </span>
                                    <Download size={15} className="shrink-0 opacity-65" />
                                  </button>
                                )}
                                <p className={`mt-1 text-right text-[10px] ${own ? 'text-white/55' : 'text-[#999]'}`}>{formatDateTime(item.createdAt)}</p>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                <div className="border-t border-[#e3e3e3] bg-white p-3 sm:p-4">
                  {canSend ? (
                    <div className="mx-auto max-w-3xl">
                      {selectedFile && (
                        <div className="mb-2 flex items-center gap-3 rounded-[11px] border border-[#dedede] bg-[#f7f7f5] px-3 py-2">
                          <FileText size={17} className="shrink-0 text-[#606060]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#333]">{selectedFile.name}</p>
                            <p className="text-[10px] text-[#8c8c8c]">{formatFileSize(selectedFile.size)}</p>
                          </div>
                          <button type="button" className="rounded p-1 text-[#888] hover:bg-white" onClick={() => setSelectedFile(null)} aria-label="Убрать файл">
                            <X size={15} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-end gap-2 rounded-[15px] border border-[#dcdcdc] bg-[#fafafa] p-1.5 focus-within:border-[#a9a9a9]">
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={(event) => chooseFile(event.target.files?.[0])}
                        />
                        <button
                          type="button"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#666] hover:bg-white hover:text-[#2f2f2f]"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={!settings.attachmentsEnabled || sending}
                          title={settings.attachmentsEnabled ? `Прикрепить файл до ${settings.maxAttachmentSizeMb} МБ` : 'Вложения отключены'}
                          aria-label="Прикрепить файл"
                        >
                          <Paperclip size={18} />
                        </button>
                        <textarea
                          className="max-h-32 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-1 py-2.5 text-sm outline-none"
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                          placeholder={selectedTicket ? 'Ответить по заявке…' : 'Сообщение…'}
                          disabled={sending}
                        />
                        <button
                          type="button"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#2f2f2f] text-white transition hover:bg-[#1f1f1f] disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => void sendMessage()}
                          disabled={sending || (!draft.trim() && !selectedFile)}
                          aria-label="Отправить"
                        >
                          <Send size={17} />
                        </button>
                      </div>
                      <p className="mt-1.5 px-1 text-[10px] text-[#999]">Enter — отправить · Shift + Enter — новая строка</p>
                    </div>
                  ) : (
                    <p className="text-center text-sm text-[#858585]">Для вашей роли переписка доступна только для чтения.</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <Modal open={newChatOpen} onClose={() => !creatingDirect && setNewChatOpen(false)} title="Новый диалог" testId="new-direct-chat-modal">
        <div className="space-y-3">
          <p className="text-sm leading-6 text-[#6b6b6b]">Выберите сотрудника. Если диалог уже существует, откроется его история.</p>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#969696]" />
            <input className="input pl-9" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Имя, почта или должность" autoFocus />
          </div>
          <div className="max-h-[380px] space-y-1 overflow-y-auto">
            {availableUsers.length === 0 ? (
              <DataState variant="empty" message="Подходящих пользователей не найдено." />
            ) : availableUsers.map((candidate) => (
              <button key={candidate.id} type="button" className="flex w-full items-center gap-3 rounded-[11px] p-3 text-left hover:bg-[#f5f5f3]" onClick={() => void startDirect(candidate.id)} disabled={creatingDirect}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2f2f2f] text-sm font-semibold text-white">{getInitials(candidate.name)}</div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#252525]">{candidate.name}</p>
                  <p className="truncate text-xs text-[#888]">{candidate.position || candidate.email}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={membersOpen} onClose={() => !participantSaving && setMembersOpen(false)} title="Участники переписки" testId="chat-members-modal">
        <div className="space-y-4">
          <div className="space-y-2">
            {currentMembers.map((member) => {
              const canRemoveInternal = selectedChat?.kind === 'GROUP'
                && selectedChat.members.length > 2
                && (member.userId === user?.id || user?.role === 'ADMIN');
              const canRemoveTicket = selection?.type === 'ticket'
                && member.role === 'PARTICIPANT'
                && (member.userId === user?.id || user?.role === 'ADMIN' || selectedTicket?.authorId === user?.id);
              return (
                <div key={member.userId} className="flex items-center gap-3 rounded-[11px] border border-[#e5e5e5] bg-white p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eeeeeb] text-sm font-semibold text-[#4d4d4d]">{getInitials(member.user.name)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#292929]">{member.user.name}</p>
                    <p className="truncate text-xs text-[#888]">
                      {'role' in member && member.role === 'AUTHOR' ? 'Автор заявки' : 'role' in member && member.role === 'ASSIGNEE' ? 'Исполнитель' : member.user.position || member.user.email}
                    </p>
                  </div>
                  {(canRemoveInternal || canRemoveTicket) && (
                    <button type="button" className="btn h-9 px-3 text-xs text-[#9b3d3d]" onClick={() => void removeParticipant(member.userId)} disabled={participantSaving}>
                      {member.userId === user?.id ? 'Выйти' : 'Убрать'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {selectedChat?.kind === 'DEPARTMENT' ? (
            <div className="rounded-[11px] border border-[#e0e0de] bg-[#f7f7f5] p-3 text-sm leading-6 text-[#707070]">
              Состав чата синхронизируется с отделом. Добавить сотрудника можно в разделе «Пользователи → Отделы».
            </div>
          ) : (
            <>
              <div className="border-t border-[#e5e5e5] pt-4">
                <div className="flex items-center gap-2">
                  <UserPlus size={16} className="text-[#5f5f5f]" />
                  <p className="text-sm font-semibold text-[#292929]">Добавить сотрудника</p>
                </div>
                <div className="relative mt-2">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#969696]" />
                  <input className="input pl-9" value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} placeholder="Найти сотрудника" />
                </div>
              </div>
              <div className="max-h-[260px] space-y-1 overflow-y-auto">
                {availableParticipants.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[#8a8a8a]">Все найденные сотрудники уже участвуют в переписке.</p>
                ) : availableParticipants.map((candidate) => (
                  <button key={candidate.id} type="button" className="flex w-full items-center gap-3 rounded-[10px] p-2.5 text-left hover:bg-[#f5f5f3]" onClick={() => void addParticipant(candidate.id)} disabled={participantSaving}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eeeeeb] text-xs font-semibold text-[#555]">{getInitials(candidate.name)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#292929]">{candidate.name}</p>
                      <p className="truncate text-xs text-[#888]">{candidate.position || candidate.email}</p>
                    </div>
                    <Plus size={16} className="text-[#666]" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};
