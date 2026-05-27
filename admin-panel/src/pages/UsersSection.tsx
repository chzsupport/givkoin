import { useEffect, useState } from 'react';
import {
  createApprovalV2,
  deleteUser,
  fetchUserChats,
  fetchUsers,
  resetUserPassword,
} from '../api/admin';
import { EditUserModal } from './users/EditUserModal';
import { UserChatsModal } from './users/UserChatsModal';
import { UsersFiltersCard } from './users/UsersFiltersCard';
import { UsersPagination } from './users/UsersPagination';
import { UsersTable } from './users/UsersTable';
import { UsersToolbar } from './users/UsersToolbar';
import {
  getApiErrorMessage,
  normalizeUserStatus,
  resourceFields,
  USERS_PAGE_SIZE,
} from './users/userHelpers';
import type {
  AdminUser,
  ChatMessage,
  EditUserForm,
  RequestApprovalPayload,
  UserFilters,
  UserSearchParams,
} from './users/userTypes';

function UsersSection({
  requestApprovalPayload,
}: {
  requestApprovalPayload: RequestApprovalPayload;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [filters, setFilters] = useState<UserFilters>({
    status: '',
    minLives: '',
    minStars: '',
    showFilters: false,
  });
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm>({
    k: 0,
    lives: 0,
    stars: 0,
    lumens: 0,
    complaintChips: 0,
    status: 'active',
  });
  const [showChats, setShowChats] = useState<AdminUser | null>(null);
  const [userChats, setUserChats] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params: UserSearchParams = { search, page, limit: USERS_PAGE_SIZE };
      if (filters.status) params.status = filters.status;
      if (filters.minLives) params.minLives = filters.minLives;
      if (filters.minStars) params.minStars = filters.minStars;
      const data = await fetchUsers(params);
      setUsers(data.users || []);
      setTotalPages(Math.max(1, Number(data.totalPages) || 1));
      setTotalUsers(Number(data.totalUsers) || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [search, filters.status, filters.minLives, filters.minStars, page]);

  useEffect(() => {
    if (!editingUser) return;
    setEditForm({
      k: Number(editingUser.k) || 0,
      lives: Number(editingUser.lives) || 0,
      stars: Number(editingUser.stars) || 0,
      lumens: Number(editingUser.lumens) || 0,
      complaintChips: editingUser.complaintChips || 3,
      status: normalizeUserStatus(editingUser.status),
    });
  }, [editingUser]);

  const handleUpdate = async () => {
    if (!editingUser) return;
    try {
      const resourceUpdates: Record<string, number> = {};
      for (const field of resourceFields) {
        const nextValue = Number(editForm[field]);
        const prevValue = Number(editingUser[field]);
        if (Number.isFinite(nextValue) && nextValue !== prevValue) {
          resourceUpdates[field] = nextValue;
        }
      }

      const hasStatusChange = String(editForm.status || '') !== String(editingUser.status || '');
      const hasResourceChange = Object.keys(resourceUpdates).length > 0;

      if (!hasStatusChange && !hasResourceChange) {
        setEditingUser(null);
        return;
      }

      const statusApproval = hasStatusChange ? requestApprovalPayload({
        title: `Смена статуса пользователя ${editingUser.nickname}`,
        impactPreviewDefault: `Статус пользователя изменится на "${editForm.status}".`,
        confirmationPhrase: 'CONFIRM users.status.update',
      }) : null;
      if (hasStatusChange && !statusApproval) return;

      const resourcesApproval = hasResourceChange ? requestApprovalPayload({
        title: `Корректировка ресурсов пользователя ${editingUser.nickname}`,
        impactPreviewDefault: `Будут изменены поля: ${Object.keys(resourceUpdates).join(', ')}`,
        confirmationPhrase: 'CONFIRM users.resources.adjust',
      }) : null;
      if (hasResourceChange && !resourcesApproval) return;

      const operationIds: string[] = [];

      if (hasStatusChange && statusApproval) {
        const res = await createApprovalV2({
          actionType: 'users.status.update',
          ...statusApproval,
          payload: {
            userId: editingUser._id,
            status: editForm.status,
          },
        });
        if (res?.operationId) operationIds.push(res.operationId);
      }

      if (hasResourceChange && resourcesApproval) {
        const res = await createApprovalV2({
          actionType: 'users.resources.adjust',
          ...resourcesApproval,
          payload: {
            userId: editingUser._id,
            updates: resourceUpdates,
          },
        });
        if (res?.operationId) operationIds.push(res.operationId);
      }

      alert(operationIds.length
        ? `Созданы заявки:\n${operationIds.join('\n')}`
        : 'Заявка создана');

      await loadUsers();
      setEditingUser(null);
    } catch (e) {
      alert(getApiErrorMessage(e, 'Ошибка создания заявок'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;
    try {
      await deleteUser(id);
      loadUsers();
    } catch (e) {
      alert('Ошибка удаления');
    }
  };

  const handleResetPassword = async (id: string) => {
    const newPass = prompt('Введите новый пароль:');
    if (!newPass) return;
    try {
      await resetUserPassword(id, { newPassword: newPass });
      alert('Пароль успешно сброшен');
    } catch (e) {
      alert('Ошибка сброса пароля');
    }
  };

  const handleViewChats = async (user: AdminUser) => {
    setShowChats(user);
    setChatLoading(true);
    try {
      const data = await fetchUserChats(user._id);
      setUserChats(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setChatLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Никнейм', 'Email', 'Статус', 'K', 'Жизни', 'Звёзды', 'Люмены'];
    const rows = users.map(u => [u._id, u.nickname, u.email, u.status, u.k, u.lives, u.stars, u.lumens]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users_export.csv';
    a.click();
  };

  return (
    <div className="space-y-6">
      <UsersToolbar
        search={search}
        showFilters={filters.showFilters}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onToggleFilters={() => setFilters(f => ({ ...f, showFilters: !f.showFilters }))}
        onExportCsv={exportCSV}
      />

      {filters.showFilters && (
        <UsersFiltersCard
          filters={filters}
          onFiltersChange={setFilters}
          onPageReset={() => setPage(1)}
        />
      )}

      <UsersPagination
        page={page}
        totalPages={totalPages}
        totalUsers={totalUsers}
        onPageChange={setPage}
      />

      <UsersTable
        users={users}
        loading={loading}
        onViewChats={handleViewChats}
        onResetPassword={handleResetPassword}
        onEdit={setEditingUser}
        onDelete={handleDelete}
      />

      <EditUserModal
        editingUser={editingUser}
        editForm={editForm}
        onEditFormChange={setEditForm}
        onClose={() => setEditingUser(null)}
        onSave={handleUpdate}
      />

      <UserChatsModal
        showChats={showChats}
        userChats={userChats}
        chatLoading={chatLoading}
        onClose={() => setShowChats(null)}
      />
    </div>
  );
}

export default UsersSection;
