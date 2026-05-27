import { USERS_PAGE_SIZE } from './userHelpers';

export function UsersPagination({
  page,
  totalPages,
  totalUsers,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalUsers: number;
  onPageChange: (page: number) => void;
}) {
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
      <div>
        {totalUsers > 0
          ? `Показаны ${(page - 1) * USERS_PAGE_SIZE + 1}–${Math.min(page * USERS_PAGE_SIZE, totalUsers)} из ${totalUsers}`
          : 'Нет пользователей'}
      </div>
      <div className="flex items-center gap-2">
        <button
          className="btn-secondary"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Назад
        </button>
        <span>
          Страница {page} из {safeTotalPages}
        </span>
        <button
          className="btn-secondary"
          onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Вперёд
        </button>
      </div>
    </div>
  );
}
