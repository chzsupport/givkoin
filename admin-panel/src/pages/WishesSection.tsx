import { useEffect, useState } from 'react';
import {
  deleteWish,
  fetchWishes,
  updateWish,
} from '../api/admin';
import { WishEditModal } from './wishes/WishEditModal';
import { WishesHeader } from './wishes/WishesHeader';
import { WishesTable } from './wishes/WishesTable';
import { createWishEditForm } from './wishes/wishHelpers';
import type { WishEditForm, WishRow } from './wishes/wishTypes';

export default function WishesSection() {
  const [wishes, setWishes] = useState<WishRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [editingWish, setEditingWish] = useState<WishRow | null>(null);
  const [editForm, setEditForm] = useState<WishEditForm>(createWishEditForm());
  const pendingFulfillmentCount = wishes.filter((wish) => wish.status === 'pending' && wish.executor).length;

  const loadWishes = async () => {
    setLoading(true);
    try {
      const data = await fetchWishes({ status: statusFilter });
      setWishes(Array.isArray(data.wishes) ? data.wishes : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWishes();
  }, [statusFilter]);

  useEffect(() => {
    if (editingWish) {
      setEditForm(createWishEditForm(editingWish));
    }
  }, [editingWish]);

  const handleUpdate = async () => {
    if (!editingWish) return;
    try {
      await updateWish(editingWish._id, editForm);
      loadWishes();
      setEditingWish(null);
    } catch (e) {
      alert('Ошибка обновления');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить это желание навсегда?')) return;
    try {
      await deleteWish(id);
      loadWishes();
    } catch (e) {
      alert('Ошибка удаления');
    }
  };

  return (
    <div className="space-y-6">
      <WishesHeader
        statusFilter={statusFilter}
        pendingFulfillmentCount={pendingFulfillmentCount}
        onStatusFilterChange={setStatusFilter}
        onReload={loadWishes}
      />

      <WishesTable
        wishes={wishes}
        loading={loading}
        onEdit={setEditingWish}
        onDelete={handleDelete}
      />

      <WishEditModal
        editingWish={editingWish}
        editForm={editForm}
        onEditFormChange={setEditForm}
        onClose={() => setEditingWish(null)}
        onSave={handleUpdate}
      />
    </div>
  );
}
