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
  Trash2,
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
import { UserAvatar } from '../components/ui/UserAvatar';
import { formatDateTime, getInitials } from '../utils';
import { prepareAvatarImage } from '../utils/avatar';
import type {
  ChatAttachment,
  ChatMessage,
  ChatSettings,
  ChatThread,
  ChatUser,
  TaskAttachment,
  TaskComment,
  TaskSummary,
  TaskTimelineEvent,
  TicketChatMember,
} from '../types';

type ChatFilter = 'all' | 'direct' | 'department' | 'ticket';
type Selection = { type: 'chat' | 'ticket'; id: string };
type ConversationItem =
  | { type: 'chat'; id: string; timestamp: string; chat: ChatThread }
  | { type: 'ticket'; id: string; timestamp: string; task: TaskSummary };
type TicketTimelineItem =
  | { type: 'message'; id: string; createdAt: string; message: TaskComment }
  | { type: 'file'; id: string; createdAt: string; file: TaskAttachment }
  | { type: 'event'; id: string; createdAt: string; event: TaskTimelineEvent };

const FILTERS: Array<{ key: ChatFilter; label: string }> = [
  { key: 'all', label: 'Все чаты' },
  { key: 'direct', label: 'Личные' },
  { key: 'department', label: 'Отделы' },
  { key: 'ticket', label: 'По заявкам' },
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

const getPriorityLabel = (priority?: string) => ({
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
}[String(priority || '').toUpperCase()] || priority || 'Не указан');

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
  return chat.title || getDirectPeer(chat, currentUserId)?.name || 'Личный чат';
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

const formatConversationTime = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: '2-digit' }),
  }).format(date);
};

const isImageAttachment = (filename: string, mimeType?: string | null) =>
  Boolean(mimeType?.startsWith('image/')) || /\.(?:jpe?g|png|webp|gif)$/i.test(filename);

const InlineImagePreview: React.FC<{
  id: string;
  filename: string;
  source: 'chat' | 'ticket';
  onOpen: (url: string, filename: string) => void;
}> = ({ id, filename, source, onOpen }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [imageUrl, setImageUrl] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '300px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let active = true;
    let objectUrl = '';
    const load = source === 'chat'
      ? chatsApi.getAttachmentBlob(id)
      : filesApi.getTaskFileBlob(id);
    void load.then((blob) => {
      if (!active) return;
      objectUrl = window.URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    }).catch(() => {
      if (active) setLoadError(true);
    });
    return () => {
      active = false;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [id, isVisible, source]);

  return (
    <div ref={containerRef} className="min-h-[120px] min-w-[220px] overflow-hidden rounded-[12px] bg-black/5">
      {imageUrl ? (
        <button type="button" className="block w-full cursor-zoom-in" onClick={() => onOpen(imageUrl, filename)} title="Открыть изображение">
          <img src={imageUrl} alt={filename} className="max-h-72 w-full object-contain" loading="lazy" />
        </button>
      ) : loadError ? (
        <div className="flex min-h-[120px] items-center justify-center px-4 text-center text-xs text-[#8a6262]">Не удалось показать изображение</div>
      ) : (
        <div className="flex min-h-[120px] items-center justify-center text-xs text-[#8b9096]">Загружаем изображение…</div>
      )}
    </div>
  );
};

export const ChatsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAvatarInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [tickets, setTickets] = useState<TaskSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ticketMessages, setTicketMessages] = useState<TaskComment[]>([]);
  const [ticketFiles, setTicketFiles] = useState<TaskAttachment[]>([]);
  const [ticketEvents, setTicketEvents] = useState<TaskTimelineEvent[]>([]);
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
  const [threadSaving, setThreadSaving] = useState(false);
  const [chatTitle, setChatTitle] = useState('');
  const [chatAvatar, setChatAvatar] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; filename: string } | null>(null);

  const selectedChat = selection?.type === 'chat'
    ? threads.find((chat) => chat.id === selection.id) || null
    : null;
  const selectedTicket = selection?.type === 'ticket'
    ? tickets.find((task) => task.id === selection.id) || null
    : null;
  const canManageSelectedChat = Boolean(
    selectedChat
    && selectedChat.kind !== 'DEPARTMENT'
    && (user?.role === 'ADMIN' || selectedChat.createdById === user?.id)
  );

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
        const [comments, files, members, events] = await Promise.all([
          commentsApi.getByTask(current.id),
          filesApi.getTaskFiles(current.id),
          chatsApi.getTicketMembers(current.id),
          tasksApi.getTimeline(current.id),
        ]);
        setTicketMessages(comments);
        setTicketFiles(files);
        setTicketMembers(members);
        setTicketEvents(events);
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
    setImagePreview(null);
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
  }, [messages, ticketMessages, ticketFiles, ticketEvents, messagesLoading]);

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
  const folderCounts = useMemo<Record<ChatFilter, number>>(() => ({
    all: threads.length + tickets.length,
    direct: threads.filter((chat) => ['DIRECT', 'GROUP'].includes(chat.kind)).length,
    department: threads.filter((chat) => chat.kind === 'DEPARTMENT').length,
    ticket: tickets.length,
  }), [threads, tickets]);

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
    ...ticketEvents
      .filter((event) => !['COMMENT_ADDED', 'INTERNAL_NOTE_ADDED', 'FILE_ATTACHED'].includes(event.type))
      .map((event) => ({
        type: 'event' as const,
        id: event.id,
        createdAt: event.createdAt,
        event,
      })),
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()), [ticketEvents, ticketFiles, ticketMessages]);

  const currentMembers = selectedChat
    ? selectedChat.members.map((member) => ({ userId: member.userId, user: member.user, role: 'PARTICIPANT' as const }))
    : ticketMembers;

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
    const currentMemberIds = new Set(
      (selectedChat ? selectedChat.members : ticketMembers).map((member) => member.userId)
    );
    return users.filter((candidate) => !currentMemberIds.has(candidate.id) && (!normalized || [
      candidate.name,
      candidate.email,
      candidate.position || '',
    ].some((value) => value.toLowerCase().includes(normalized))));
  }, [participantSearch, selectedChat, ticketMembers, users]);

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

  const openConversationSettings = () => {
    setChatTitle(selectedChat?.title || '');
    setChatAvatar(selectedChat?.avatar || null);
    setMembersOpen(true);
  };

  const saveChatSettings = async () => {
    if (!selectedChat || !canManageSelectedChat || threadSaving) return;
    setThreadSaving(true);
    setError('');
    try {
      const updated = await chatsApi.updateThread(selectedChat.id, { title: chatTitle, avatar: chatAvatar });
      setThreads((current) => current.map((item) => item.id === updated.id ? updated : item));
      setChatTitle(updated.title || '');
      setChatAvatar(updated.avatar || null);
    } catch (updateError) {
      setError(getApiError(updateError, 'Не удалось сохранить настройки чата.'));
    } finally {
      setThreadSaving(false);
    }
  };

  const chooseChatAvatar = async (file?: File) => {
    if (!file || !canManageSelectedChat) return;
    setError('');
    try {
      setChatAvatar(await prepareAvatarImage(file));
    } catch (avatarError) {
      setError(avatarError instanceof Error ? avatarError.message : 'Не удалось обработать аватар чата.');
    } finally {
      if (chatAvatarInputRef.current) chatAvatarInputRef.current.value = '';
    }
  };

  const deleteSelectedChat = async () => {
    if (!selectedChat || !canManageSelectedChat || threadSaving) return;
    const title = getChatTitle(selectedChat, user?.id);
    if (!window.confirm(`Удалить чат «${title}» вместе со всей историей и вложениями? Это действие нельзя отменить.`)) return;
    setThreadSaving(true);
    setError('');
    try {
      await chatsApi.deleteThread(selectedChat.id);
      setThreads((current) => current.filter((item) => item.id !== selectedChat.id));
      setMembersOpen(false);
      setSelection(null);
      setMessages([]);
    } catch (deleteError) {
      setError(getApiError(deleteError, 'Не удалось удалить чат.'));
    } finally {
      setThreadSaving(false);
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
  const ticketContextCard = selectedTicket ? (
    <div className="mb-4 rounded-[14px] border border-[#d9dfe7] bg-white p-4 shadow-[0_5px_18px_rgba(35,40,46,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[#68717d]">
            <span>{getTaskNumber(selectedTicket)}</span>
            <span className="rounded-full bg-[#edf1f6] px-2.5 py-1 text-[#40536c]">{getStatusLabel(selectedTicket.status)}</span>
            <span>Приоритет: {getPriorityLabel(selectedTicket.priority)}</span>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-[#24282e]">{selectedTicket.title}</h3>
          {selectedTicket.description && (
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#626972]">{selectedTicket.description}</p>
          )}
          <p className="mt-2 text-[11px] text-[#8b9097]">
            Заявитель: {selectedTicket.author?.name || 'Не указан'} · Создана {formatDateTime(selectedTicket.createdAt)}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[9px] border border-[#dfe2e6] px-3 text-xs font-medium text-[#4e5660] transition hover:bg-[#f4f5f6]"
          onClick={() => navigate(`/tickets?taskId=${selectedTicket.id}`)}
        >
          <ExternalLink size={14} />
          Открыть заявку
        </button>
      </div>
    </div>
  ) : null;

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
    <div className="space-y-3" data-testid="chats-page">
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f3333]">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Закрыть"><X size={16} /></button>
        </div>
      )}

      <div className="h-[calc(100dvh-118px)] min-h-[590px] overflow-hidden rounded-[14px] border border-[#d8d8d5] bg-white shadow-[0_18px_50px_rgba(27,31,36,0.1)] md:h-[calc(100dvh-90px)]">
        <div className="grid h-full min-h-0 md:grid-cols-[300px_minmax(0,1fr)]">
          <aside className={`${selection ? 'hidden md:flex' : 'flex'} min-h-0 flex-col bg-[#292d33] text-white`}>
            <div className="shrink-0 px-4 pb-3 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-white">Сообщения</h1>
                  <p className="mt-0.5 truncate text-[11px] text-white/45">Рабочие переписки</p>
                </div>
                {settings.directChatsEnabled && (
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#292d33] transition hover:bg-[#f0f0ed]"
                    onClick={() => setNewChatOpen(true)}
                    aria-label="Новый диалог"
                    title="Новый диалог"
                  >
                    <Plus size={17} />
                  </button>
                )}
              </div>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <input
                  className="mt-3 h-10 w-full rounded-[10px] border border-white/5 bg-white/[0.07] pl-9 pr-3 text-[13px] text-white outline-none transition placeholder:text-white/35 focus:border-white/15 focus:bg-white/10"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Найти чат или сотрудника"
                />
              </div>
            </div>

            <div className="shrink-0 border-y border-white/[0.07] px-3 py-3">
              <div className="mb-2 flex items-center justify-between px-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Папки</p>
                <span className="text-[10px] text-white/30">{folderCounts.all}</span>
              </div>
              <div className="space-y-0.5">
                {FILTERS.filter((item) => (
                  item.key === 'all'
                  || (item.key === 'direct' && settings.directChatsEnabled)
                  || (item.key === 'department' && settings.departmentChatsEnabled)
                  || (item.key === 'ticket' && settings.ticketChatsEnabled)
                )).map((item) => {
                  const FolderIcon = item.key === 'all'
                    ? MessageCircle
                    : item.key === 'direct'
                      ? UserRound
                      : item.key === 'department'
                        ? Building2
                        : Ticket;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setFilter(item.key);
                        setSelection(null);
                      }}
                      className={`flex h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[12px] font-medium transition ${
                        filter === item.key ? 'bg-white/[0.12] text-white' : 'text-white/60 hover:bg-white/[0.07] hover:text-white'
                      }`}
                    >
                      <FolderIcon size={14} strokeWidth={1.8} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className={`text-[10px] ${filter === item.key ? 'text-white/65' : 'text-white/30'}`}>{folderCounts[item.key]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Диалоги</p>
                <span className="text-[10px] text-white/30">{conversationItems.length}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
                {loading ? (
                  <p className="px-3 py-6 text-center text-xs text-white/40">Загружаем диалоги...</p>
                ) : conversationItems.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs leading-5 text-white/40">В этой папке пока нет переписок.</p>
                ) : (
                <div className="space-y-0.5">
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
                    const avatar = isTicket
                      ? item.task.author?.avatar
                      : item.chat.avatar || (item.chat.kind === 'DIRECT' ? getDirectPeer(item.chat, user?.id)?.avatar : null);
                    return (
                      <button
                        key={`${item.type}:${item.id}`}
                        type="button"
                        onClick={() => setSelection({ type: item.type, id: item.id })}
                        className={`relative w-full rounded-[10px] px-2.5 py-2.5 text-left transition ${
                          active ? 'bg-white/[0.13]' : 'hover:bg-white/[0.07]'
                        }`}
                      >
                        {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-white" />}
                        <div className="flex items-center gap-2.5">
                          {avatar ? (
                            <UserAvatar name={title} avatar={avatar} className="h-10 w-10 border border-white/15 bg-white/15 text-[11px] text-white" />
                          ) : (
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                              isTicket
                                ? 'bg-[#e9dfcf] text-[#62533e]'
                                : item.chat.kind === 'DEPARTMENT'
                                  ? 'bg-[#d9e5e3] text-[#3f5a57]'
                                  : 'bg-white/15 text-white'
                            }`}>
                              {!isTicket && item.chat.kind === 'DIRECT'
                                ? getInitials(getDirectPeer(item.chat, user?.id)?.name || title)
                                : <Icon size={18} />}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className={`truncate text-[12px] ${unread > 0 ? 'font-semibold text-white' : 'font-medium text-white/85'}`}>{title}</p>
                              <span className="ml-auto shrink-0 text-[9px] font-medium text-white/30">{formatConversationTime(item.timestamp)}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <p className={`min-w-0 flex-1 truncate text-[10px] ${unread > 0 ? 'font-medium text-white/65' : 'text-white/35'}`}>{preview}</p>
                              {unread > 0 && (
                                <span className="flex min-h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-white px-1 text-[9px] font-semibold text-[#292d33]">
                                  {unread > 99 ? '99+' : unread}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                )}
              </div>
            </div>
          </aside>

          <section className={`${selection ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-col bg-white`}>
            {!selection ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="max-w-sm text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e6eaf0] text-[#2d3c54]">
                    <MessageCircle size={26} strokeWidth={1.7} />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-[#252525]">Выберите переписку</h2>
                  <p className="mt-1.5 text-sm leading-6 text-[#7c7f84]">Откройте чат слева или начните новый диалог.</p>
                </div>
              </div>
            ) : (
              <>
                <header className="flex min-h-[66px] shrink-0 items-center gap-3 border-b border-[#e8e8e5] bg-white px-3 py-2.5 sm:px-5">
                  <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#555] hover:bg-[#f1f1ef] md:hidden" onClick={() => setSelection(null)} aria-label="Назад">
                    <ArrowLeft size={17} className="mx-auto" />
                  </button>
                  {(selectedChat?.avatar || (selectedChat?.kind === 'DIRECT' && getDirectPeer(selectedChat, user?.id)?.avatar) || selectedTicket?.author?.avatar) ? (
                    <UserAvatar
                      name={currentTitle}
                      avatar={selectedChat?.avatar || (selectedChat?.kind === 'DIRECT' ? getDirectPeer(selectedChat, user?.id)?.avatar : null) || selectedTicket?.author?.avatar}
                      className="h-10 w-10 bg-[#e8ecf1] text-xs text-[#2d3c54]"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8ecf1] text-xs font-semibold text-[#2d3c54]">
                      {selectedChat?.kind === 'DIRECT'
                        ? getInitials(getDirectPeer(selectedChat, user?.id)?.name || currentTitle)
                        : selectedTicket
                          ? <Ticket size={17} />
                          : selectedChat?.kind === 'DEPARTMENT'
                            ? <Building2 size={17} />
                            : <Users size={17} />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[14px] font-semibold text-[#222]">{currentTitle}</h2>
                    <p className="mt-0.5 truncate text-[11px] text-[#858580]">{currentKind} · {currentSubtitle}</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-[9px] px-2.5 text-xs font-medium text-[#555] transition hover:bg-[#f1f1ef] hover:text-[#222]"
                    onClick={openConversationSettings}
                    title="Настройки переписки"
                  >
                    <Settings2 size={16} />
                    <span className="hidden lg:inline">Настройки</span>
                  </button>
                  {canManageSelectedChat && (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-2 rounded-[9px] px-2.5 text-xs font-medium text-[#9d4444] transition hover:bg-[#fff0f0] hover:text-[#862e2e]"
                      onClick={() => void deleteSelectedChat()}
                      disabled={threadSaving}
                      title="Удалить чат"
                    >
                      <Trash2 size={15} />
                      <span className="hidden xl:inline">Удалить</span>
                    </button>
                  )}
                  {selectedTicket && (
                    <button type="button" className="inline-flex h-9 items-center gap-2 rounded-[9px] px-2.5 text-xs font-medium text-[#555] transition hover:bg-[#f1f1ef] hover:text-[#222]" onClick={() => navigate(`/tickets?taskId=${selectedTicket.id}`)}>
                      <ExternalLink size={15} />
                      <span className="hidden lg:inline">Заявка</span>
                    </button>
                  )}
                </header>

                <div
                  className="min-h-0 flex-1 overflow-y-auto bg-[#fbfbfa] px-3 py-5 sm:px-7"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 12% 8%, rgba(255,255,255,0.95), transparent 30%), radial-gradient(circle at 88% 92%, rgba(232,234,236,0.42), transparent 32%)',
                  }}
                >
                  {messagesLoading ? (
                    <DataState variant="loading" message="Загружаем переписку..." />
                  ) : selection.type === 'chat' ? (
                    messages.length === 0 ? (
                      <DataState variant="empty" message="В диалоге пока нет сообщений. Напишите первым или прикрепите файл." />
                    ) : (
                      <div className="mx-auto max-w-4xl space-y-1.5">
                        {messages.map((message, index) => {
                          const own = message.authorId === user?.id;
                          const showDay = index === 0 || !sameDay(messages[index - 1]?.createdAt, message.createdAt);
                          return (
                            <React.Fragment key={message.id}>
                              {showDay && (
                                <div className="flex items-center gap-3 py-3">
                                  <span className="h-px flex-1 bg-[#dfe2e5]" />
                                  <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#96999d]">
                                    {getDayLabel(message.createdAt)}
                                  </span>
                                  <span className="h-px flex-1 bg-[#dfe2e5]" />
                                </div>
                              )}
                              <div className={`group flex items-end gap-2 ${own ? 'justify-end' : 'justify-start'}`}>
                                {!own && (
                                  <UserAvatar name={message.author.name} avatar={message.author.avatar} className="h-7 w-7 bg-[#dde3ea] text-[10px] text-[#3f4f64]" />
                                )}
                                <div className={`flex max-w-[86%] flex-col ${own ? 'items-end' : 'items-start'} sm:max-w-[72%]`}>
                                  {!own && <p className="mb-1 px-1 text-[11px] font-medium text-[#676d75]">{message.author.name}</p>}
                                  <div className={`rounded-[17px] px-3.5 py-2.5 ${
                                    own
                                      ? 'rounded-br-[5px] bg-[#2d3c54] text-white shadow-[0_5px_14px_rgba(45,60,84,0.16)]'
                                      : 'rounded-bl-[5px] border border-[#e0e3e6] bg-white text-[#292929] shadow-[0_3px_10px_rgba(35,40,46,0.05)]'
                                  }`}>
                                    {message.content && <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>}
                                    {message.attachments?.length > 0 && (
                                      <div className={`${message.content ? 'mt-2' : ''} space-y-2`}>
                                        {message.attachments.map((attachment) => (
                                          isImageAttachment(attachment.filename, attachment.mimeType) ? (
                                            <div key={attachment.id} className={`min-w-[230px] rounded-[12px] border p-1.5 ${own ? 'border-white/20 bg-white/10' : 'border-[#e4e6e8] bg-[#f5f6f7]'}`}>
                                              <InlineImagePreview
                                                id={attachment.id}
                                                filename={attachment.filename}
                                                source="chat"
                                                onOpen={(url, filename) => setImagePreview({ url, filename })}
                                              />
                                              <div className="flex items-center gap-2 px-2 py-1.5">
                                                <span className="min-w-0 flex-1 truncate text-xs">{attachment.filename}</span>
                                                <button type="button" className="rounded p-1 opacity-70 hover:bg-black/10 hover:opacity-100" onClick={() => void downloadChatAttachment(attachment)} title="Скачать">
                                                  <Download size={14} />
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <button
                                              key={attachment.id}
                                              type="button"
                                              className={`flex w-full min-w-[210px] items-center gap-3 rounded-[12px] border p-2.5 text-left ${
                                                own ? 'border-white/20 bg-white/10 hover:bg-white/15' : 'border-[#e4e6e8] bg-[#f5f6f7] hover:bg-[#eef0f2]'
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
                                          )
                                        ))}
                                      </div>
                                    )}
                                    <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-white/55' : 'text-[#999]'}`}>
                                      {message.editedAt && <span>изменено ·</span>}
                                      <span>{formatDateTime(message.createdAt)}</span>
                                    </div>
                                  </div>
                                  {own && (
                                  <div className="mt-1 flex gap-2 px-1 text-[10px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                      {message.content && <button type="button" onClick={() => void editInternalMessage(message)} className="text-[#7c7c7c] hover:text-[#333]">Изменить</button>}
                                      <button type="button" onClick={() => void deleteInternalMessage(message)} className="text-[#a36b6b] hover:text-[#963737]">Удалить</button>
                                    </div>
                                  )}
                                </div>
                                {own && (
                                  <UserAvatar name={message.author.name} avatar={message.author.avatar || user?.avatar} className="h-7 w-7 bg-[#2d3c54] text-[10px] text-white" />
                                )}
                              </div>
                            </React.Fragment>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )
                  ) : ticketTimeline.length === 0 ? (
                    <div className="mx-auto max-w-4xl">
                      {ticketContextCard}
                      <DataState variant="empty" message="В заявке пока нет сообщений, файлов и событий. Ответ появится одновременно здесь и в карточке заявки." />
                    </div>
                  ) : (
                    <div className="mx-auto max-w-4xl space-y-1.5">
                      {ticketContextCard}
                      {ticketTimeline.map((item, index) => {
                        const own = item.type === 'message'
                          ? item.message.authorId === user?.id
                          : item.type === 'file'
                            ? item.file.uploadedById === user?.id
                            : false;
                        const showDay = index === 0 || !sameDay(ticketTimeline[index - 1]?.createdAt, item.createdAt);
                        return (
                          <React.Fragment key={`${item.type}:${item.id}`}>
                            {showDay && (
                              <div className="flex items-center gap-3 py-3">
                                <span className="h-px flex-1 bg-[#dfe2e5]" />
                                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#96999d]">{getDayLabel(item.createdAt)}</span>
                                <span className="h-px flex-1 bg-[#dfe2e5]" />
                              </div>
                            )}
                            {item.type === 'event' ? (
                              <div className="flex justify-center py-1">
                                <div className="max-w-[92%] rounded-full border border-[#dfe3e8] bg-[#f1f3f5] px-3.5 py-2 text-center text-[11px] text-[#66707a]">
                                  <span className="font-semibold text-[#48525d]">{item.event.title}</span>
                                  {item.event.description && <span> · {item.event.description}</span>}
                                  {item.event.actor?.name && <span> · {item.event.actor.name}</span>}
                                  <span className="ml-1 text-[#969ca3]">{formatConversationTime(item.createdAt)}</span>
                                </div>
                              </div>
                            ) : (
                              <div className={`flex items-end gap-2 ${own ? 'justify-end' : 'justify-start'}`}>
                                {item.type === 'message' && !own && (
                                  <UserAvatar name={item.message.author?.name} avatar={item.message.author?.avatar} className="h-7 w-7 bg-[#dde3ea] text-[10px] text-[#3f4f64]" />
                                )}
                                <div className={`max-w-[86%] rounded-[17px] px-3.5 py-2.5 sm:max-w-[72%] ${
                                  own
                                    ? 'rounded-br-[5px] bg-[#2d3c54] text-white shadow-[0_5px_14px_rgba(45,60,84,0.16)]'
                                    : 'rounded-bl-[5px] border border-[#e0e3e6] bg-white text-[#292929] shadow-[0_3px_10px_rgba(35,40,46,0.05)]'
                                }`}>
                                  {item.type === 'message' ? (
                                    <>
                                      {!own && <p className="mb-1 text-xs font-semibold text-[#696969]">{item.message.author?.name || 'Участник'}</p>}
                                      <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.message.content}</p>
                                    </>
                                  ) : isImageAttachment(item.file.filename) ? (
                                    <div className={`min-w-[230px] rounded-[12px] border p-1.5 ${own ? 'border-white/20 bg-white/10' : 'border-[#e4e6e8] bg-[#f5f6f7]'}`}>
                                      <InlineImagePreview
                                        id={item.file.id}
                                        filename={item.file.filename}
                                        source="ticket"
                                        onOpen={(url, filename) => setImagePreview({ url, filename })}
                                      />
                                      <div className="flex items-center gap-2 px-2 py-1.5">
                                        <span className="min-w-0 flex-1 truncate text-xs">{item.file.filename}</span>
                                        <button type="button" className="rounded p-1 opacity-70 hover:bg-black/10 hover:opacity-100" onClick={() => void filesApi.downloadTaskFile(item.file.id, item.file.filename)} title="Скачать">
                                          <Download size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className={`flex min-w-[210px] items-center gap-3 rounded-[12px] border p-2.5 text-left ${
                                        own ? 'border-white/20 bg-white/10' : 'border-[#e4e6e8] bg-[#f5f6f7]'
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
                                {item.type === 'message' && own && (
                                  <UserAvatar name={item.message.author?.name} avatar={item.message.author?.avatar || user?.avatar} className="h-7 w-7 bg-[#2d3c54] text-[10px] text-white" />
                                )}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-[#e8e8e5] bg-white px-3 py-3 sm:px-6">
                  {canSend ? (
                    <div className="mx-auto max-w-4xl">
                      {selectedFile && (
                        <div className="mb-2 flex items-center gap-3 rounded-[10px] border border-[#e1e2df] bg-[#f7f7f5] px-3 py-2">
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
                      <div className="flex items-end gap-1.5 rounded-[12px] border border-[#dedfdb] bg-[#f7f7f5] p-1.5 transition focus-within:border-[#aeb3b9] focus-within:bg-white">
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={(event) => chooseFile(event.target.files?.[0])}
                        />
                        <button
                          type="button"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] text-[#73766f] transition hover:bg-white hover:text-[#2d3c54]"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={!settings.attachmentsEnabled || sending}
                          title={settings.attachmentsEnabled ? `Прикрепить файл до ${settings.maxAttachmentSizeMb} МБ` : 'Вложения отключены'}
                          aria-label="Прикрепить файл"
                        >
                          <Paperclip size={18} />
                        </button>
                        <textarea
                          className="max-h-32 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-1.5 py-2.5 text-sm leading-5 outline-none placeholder:text-[#a0a3a7]"
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
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[#2d3c54] text-white transition hover:bg-[#223046] disabled:cursor-not-allowed disabled:opacity-35"
                          onClick={() => void sendMessage()}
                          disabled={sending || (!draft.trim() && !selectedFile)}
                          aria-label="Отправить"
                        >
                          <Send size={17} />
                        </button>
                      </div>
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

      <Modal
        open={Boolean(imagePreview)}
        onClose={() => setImagePreview(null)}
        title={imagePreview?.filename || 'Просмотр изображения'}
        size="wide"
        testId="chat-image-preview-modal"
      >
        {imagePreview && (
          <div className="space-y-3">
            <div className="flex max-h-[72vh] items-center justify-center overflow-hidden rounded-[12px] bg-[#f2f3f4] p-2">
              <img src={imagePreview.url} alt={imagePreview.filename} className="max-h-[70vh] max-w-full object-contain" />
            </div>
            <div className="flex justify-end">
              <a className="btn inline-flex items-center gap-2" href={imagePreview.url} download={imagePreview.filename}>
                <Download size={15} />
                Скачать оригинал
              </a>
            </div>
          </div>
        )}
      </Modal>

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
                <UserAvatar name={candidate.name} avatar={candidate.avatar} className="h-10 w-10 bg-[#2f2f2f] text-sm text-white" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#252525]">{candidate.name}</p>
                  <p className="truncate text-xs text-[#888]">{candidate.position || candidate.email}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={membersOpen} onClose={() => !participantSaving && !threadSaving && setMembersOpen(false)} title="Настройки переписки" testId="chat-members-modal">
        <div className="space-y-4">
          {selectedChat && selectedChat.kind !== 'DEPARTMENT' && (
            <div className="rounded-[12px] border border-[#e3e3e3] bg-[#f8f8f7] p-4">
              <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[#e4e4e2] pb-4">
                <UserAvatar name={getChatTitle(selectedChat, user?.id)} avatar={chatAvatar} className="h-16 w-16 bg-[#2d3c54] text-lg text-white" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#292929]">Аватар чата</p>
                  <p className="mt-1 text-xs leading-5 text-[#858585]">Отдельная картинка помогает быстро отличать рабочие беседы.</p>
                  {canManageSelectedChat && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        ref={chatAvatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(event) => void chooseChatAvatar(event.target.files?.[0])}
                      />
                      <button type="button" className="btn h-9 px-3 text-xs" onClick={() => chatAvatarInputRef.current?.click()} disabled={threadSaving}>
                        Выбрать изображение
                      </button>
                      {chatAvatar && (
                        <button type="button" className="btn h-9 px-3 text-xs" onClick={() => setChatAvatar(null)} disabled={threadSaving}>
                          Удалить
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <label htmlFor="chat-title" className="text-sm font-semibold text-[#292929]">Название чата</label>
              <p className="mt-1 text-xs leading-5 text-[#858585]">
                Особенно удобно для бесед с несколькими участниками. Пустое название вернёт автоматический список имён.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  id="chat-title"
                  className="input min-w-0 flex-1"
                  value={chatTitle}
                  onChange={(event) => setChatTitle(event.target.value.slice(0, 80))}
                  placeholder="Например: Запуск нового офиса"
                  disabled={!canManageSelectedChat || threadSaving}
                  maxLength={80}
                />
                {canManageSelectedChat && (
                  <button type="button" className="btn btn-primary shrink-0" onClick={() => void saveChatSettings()} disabled={threadSaving}>
                    {threadSaving ? 'Сохраняем…' : 'Сохранить'}
                  </button>
                )}
              </div>
              {!canManageSelectedChat && (
                <p className="mt-2 text-xs text-[#8a8a8a]">Название может менять создатель беседы или администратор.</p>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-[#292929]">Участники</p>
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
                  <UserAvatar name={member.user.name} avatar={member.user.avatar} className="h-10 w-10 bg-[#eeeeeb] text-sm text-[#4d4d4d]" />
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
                    <UserAvatar name={candidate.name} avatar={candidate.avatar} className="h-9 w-9 bg-[#eeeeeb] text-xs text-[#555]" />
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

          {selectedChat && canManageSelectedChat && (
            <div className="border-t border-[#eadada] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[11px] border border-[#f0cece] bg-[#fff6f6] p-3">
                <div>
                  <p className="text-sm font-semibold text-[#923b3b]">Удалить чат</p>
                  <p className="mt-1 text-xs text-[#a56a6a]">История сообщений и все вложения будут удалены без возможности восстановления.</p>
                </div>
                <button type="button" className="btn inline-flex items-center gap-2 border-[#e5baba] text-[#a23636] hover:bg-[#ffeaea]" onClick={() => void deleteSelectedChat()} disabled={threadSaving}>
                  <Trash2 size={15} />
                  Удалить чат
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
