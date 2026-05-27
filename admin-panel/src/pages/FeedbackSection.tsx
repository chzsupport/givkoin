import { useEffect, useState } from 'react';

import {
  archiveFeedbackMessage,
  deleteFeedbackMessage,
  fetchFeedbackMessages,
  replyFeedbackMessage,
} from '../api/admin';
import { FeedbackHeader } from './feedback/FeedbackHeader';
import { FeedbackMessageList } from './feedback/FeedbackMessageList';
import { FeedbackMessageModal } from './feedback/FeedbackMessageModal';
import type { FeedbackMessage, FeedbackStatus } from './feedback/feedbackTypes';

export default function FeedbackSection() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FeedbackMessage[]>([]);
  const [status, setStatus] = useState<FeedbackStatus>('new');
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<FeedbackMessage | null>(null);
  const [replySubject, setReplySubject] = useState('');
  const [replyMessage, setReplyMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchFeedbackMessages({ status, limit: 200 });
      setItems(Array.isArray(data?.messages) ? data.messages : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status]);

  const archive = async (id: string) => {
    setArchivingId(id);
    try {
      await archiveFeedbackMessage(id);
      setItems((prev) => prev.filter((message) => String(message._id) !== String(id)));
      if (selected && String(selected._id) === String(id)) {
        setSelected((prev) => (prev ? { ...prev, status: 'archived' } : prev));
      }
    } catch {
      alert('Ошибка архивации');
    } finally {
      setArchivingId(null);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteFeedbackMessage(id);
      setItems((prev) => prev.filter((message) => String(message._id) !== String(id)));
      if (selected && String(selected._id) === String(id)) {
        setSelected(null);
      }
    } catch {
      alert('Ошибка удаления');
    } finally {
      setDeletingId(null);
    }
  };

  const sendReply = async () => {
    if (!selected?._id) return;
    if (!replyMessage.trim()) {
      alert('Введите текст ответа');
      return;
    }
    setReplyingId(String(selected._id));
    try {
      await replyFeedbackMessage(String(selected._id), {
        subject: replySubject.trim() || undefined,
        message: replyMessage.trim(),
      });
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((message) => (
        String(message._id) === String(selected._id) ? { ...message, repliedAt: nowIso } : message
      )));
      setSelected((prev) => (prev ? { ...prev, repliedAt: nowIso } : prev));
      setReplyMessage('');
      alert('Ответ отправлен');
    } catch {
      alert('Ошибка отправки ответа');
    } finally {
      setReplyingId(null);
    }
  };

  const openMessage = (message: FeedbackMessage) => {
    setSelected(message);
    setReplySubject('');
    setReplyMessage('');
  };

  const closeMessage = () => {
    setSelected(null);
    setReplySubject('');
    setReplyMessage('');
  };

  return (
    <div className="space-y-6">
      <FeedbackHeader status={status} onStatusChange={setStatus} onReload={load} />

      <FeedbackMessageList
        loading={loading}
        items={items}
        status={status}
        archivingId={archivingId}
        deletingId={deletingId}
        onArchive={archive}
        onDelete={remove}
        onOpen={openMessage}
      />

      <FeedbackMessageModal
        selected={selected}
        status={status}
        replySubject={replySubject}
        replyMessage={replyMessage}
        archivingId={archivingId}
        deletingId={deletingId}
        replyingId={replyingId}
        onClose={closeMessage}
        onReplySubjectChange={setReplySubject}
        onReplyMessageChange={setReplyMessage}
        onArchive={archive}
        onDelete={remove}
        onReply={sendReply}
      />
    </div>
  );
}
