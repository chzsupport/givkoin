import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  createPost as apiCreatePost,
  deletePost,
  deletePosts,
  fetchPosts,
  publishPost,
  updatePost,
} from '../api/news';
import LanguageToggle from '../components/LanguageToggle';
import { ContentBulkActions } from './content/ContentBulkActions';
import { ContentEditorModal } from './content/ContentEditorModal';
import { ContentPostList } from './content/ContentPostList';
import { ContentStatsCard } from './content/ContentStatsCard';
import { ContentStatusTabs } from './content/ContentStatusTabs';
import {
  emptyPostForm,
  formatLocalDateTimeInput,
  getApiError,
  getApiErrorMessage,
  getPostId,
  normalizePostContent,
  normalizePostStatus,
} from './content/contentHelpers';
import type { AdminPost, PostForm } from './content/contentTypes';
import { getTranslatedField, type ContentLanguage } from '../utils/localizedContent';

function ContentSection() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPost, setEditingPost] = useState<AdminPost | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<ContentLanguage>('ru');
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [postForm, setPostForm] = useState<PostForm>(emptyPostForm);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p] = await Promise.all([fetchPosts()]);
      const nextPosts: AdminPost[] = Array.isArray(p) ? p : [];
      const nextIds = new Set(nextPosts.map(getPostId).filter(Boolean));
      setPosts(nextPosts);
      setSelectedPostIds(prev => prev.filter(id => nextIds.has(id)));
    } catch (e) {
      console.error(e);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredPosts = useMemo(() => {
    if (!statusFilter) return posts;
    return posts.filter(p => p.status === statusFilter);
  }, [posts, statusFilter]);

  const filteredPostIds = useMemo(() => filteredPosts.map(getPostId).filter(Boolean), [filteredPosts]);
  const selectedPostIdsSet = useMemo(() => new Set(selectedPostIds), [selectedPostIds]);
  const allFilteredSelected = filteredPostIds.length > 0 && filteredPostIds.every((id) => selectedPostIdsSet.has(id));

  useEffect(() => {
    loadData();
  }, []);

  const handlePublish = async (id: string) => {
    if (!id) {
      alert('Не найден ID поста для публикации');
      return;
    }
    try {
      await publishPost(id);
      loadData();
    } catch (e) {
      alert(getApiErrorMessage(e, 'Ошибка публикации'));
    }
  };

  const handleCreate = async () => {
    try {
      const cleanContent = normalizePostContent(postForm.content);
      const cleanEnContent = normalizePostContent(postForm.enContent);
      if (!postForm.title.trim()) {
        alert('Введите заголовок');
        return;
      }
      if (!cleanContent.trim()) {
        alert('Введите содержание поста');
        return;
      }
      const payload = {
        title: postForm.title,
        content: cleanContent,
        mediaUrl: postForm.mediaUrl,
        status: postForm.status,
        scheduledAt: postForm.scheduledAt,
        translations: {
          en: {
            title: postForm.enTitle.trim(),
            content: cleanEnContent,
          },
        },
      };
      if (editingPost) {
        const postId = getPostId(editingPost);
        if (!postId) {
          alert('Не найден ID поста для сохранения');
          return;
        }
        await updatePost(postId, payload);
      } else {
        await apiCreatePost(payload);
      }
      loadData();
      setShowCreate(false);
      setEditingPost(null);
      setPostForm(emptyPostForm);
    } catch (e) {
      alert(getApiErrorMessage(e, 'Ошибка сохранения'));
    }
  };

  const handleDeletePost = async (id: string) => {
    if (!id) {
      alert('Не найден ID поста для удаления');
      return false;
    }
    if (!confirm('Удалить этот пост?')) return false;
    try {
      await deletePost(id);
      setSelectedPostIds(prev => prev.filter(postId => postId !== id));
      loadData();
      return true;
    } catch (e) {
      if (getApiError(e).response?.status === 404) {
        await loadData();
        return true;
      }
      alert(getApiErrorMessage(e, 'Ошибка удаления'));
      return false;
    }
  };

  const togglePostSelection = (id: string) => {
    if (!id) return;
    setSelectedPostIds(prev => (
      prev.includes(id)
        ? prev.filter(postId => postId !== id)
        : [...prev, id]
    ));
  };

  const toggleAllFilteredPosts = () => {
    if (filteredPostIds.length === 0) return;
    setSelectedPostIds(prev => {
      const current = new Set(prev);
      if (filteredPostIds.every((id) => current.has(id))) {
        filteredPostIds.forEach((id) => current.delete(id));
      } else {
        filteredPostIds.forEach((id) => current.add(id));
      }
      return Array.from(current);
    });
  };

  const handleDeleteSelectedPosts = async () => {
    const ids = selectedPostIds.filter(Boolean);
    if (!ids.length) {
      alert('Выберите посты для удаления');
      return;
    }
    if (!confirm(`Удалить выбранные посты: ${ids.length}?`)) return;
    try {
      await deletePosts(ids);
      setSelectedPostIds([]);
      loadData();
    } catch (e) {
      alert(getApiErrorMessage(e, 'Ошибка удаления выбранных постов'));
    }
  };

  const handleEditPost = (post: AdminPost) => {
    const title = getTranslatedField(post.title, post.translations, 'title');
    const content = getTranslatedField(normalizePostContent(post.content || ''), post.translations, 'content');
    setEditingPost(post);
    setPostForm({
      title: title.ru,
      content: content.ru,
      enTitle: title.en,
      enContent: normalizePostContent(content.en),
      mediaUrl: post.mediaUrl || '',
      status: normalizePostStatus(post.status),
      scheduledAt: formatLocalDateTimeInput(post.scheduledAt)
    });
    setShowCreate(true);
  };

  const handleDeleteFromModal = async () => {
    const postId = getPostId(editingPost);
    if (!postId) return;
    const deleted = await handleDeletePost(postId);
    if (!deleted) return;
    setShowCreate(false);
    setEditingPost(null);
    setPostForm(emptyPostForm);
  };

  const closeEditor = () => {
    setShowCreate(false);
    setEditingPost(null);
    setPostForm(emptyPostForm);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Управление контентом</h2>
        <div className="flex items-center gap-3">
          <LanguageToggle value={activeLanguage} onChange={setActiveLanguage} />
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={18} />
            Создать пост
          </button>
        </div>
      </div>

      <ContentStatusTabs statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />

      {filteredPosts.length > 0 && (
        <ContentBulkActions
          allFilteredSelected={allFilteredSelected}
          selectedCount={selectedPostIds.length}
          onToggleAllFiltered={toggleAllFilteredPosts}
          onClearSelection={() => setSelectedPostIds([])}
          onDeleteSelected={handleDeleteSelectedPosts}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <ContentPostList
            loading={loading}
            posts={filteredPosts}
            activeLanguage={activeLanguage}
            selectedPostIdsSet={selectedPostIdsSet}
            onTogglePostSelection={togglePostSelection}
            onPublish={handlePublish}
            onEdit={handleEditPost}
            onDelete={handleDeletePost}
          />
        </div>
        <div className="space-y-6">
          <ContentStatsCard posts={posts} />
        </div>
      </div>

      <ContentEditorModal
        show={showCreate}
        editingPost={editingPost}
        activeLanguage={activeLanguage}
        postForm={postForm}
        uploadingMedia={uploadingMedia}
        onLanguageChange={setActiveLanguage}
        onFormChange={setPostForm}
        onUploadingMediaChange={setUploadingMedia}
        onClose={closeEditor}
        onDelete={handleDeleteFromModal}
        onSave={handleCreate}
      />
    </div >
  );
}

export default ContentSection;
