const express = require('express');
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const adminAuth = require('../middleware/adminAuth');
const {
  createCategory,
  updateCategory,
  deleteCategory,
  listCategories,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  listPosts,
  listComments,
  recordViews,
  interact,
  updateComment,
  deleteComment,
} = require('../controllers/newsController');

const router = express.Router();

// Категории (админ)
router.post('/categories', auth, adminAuth, createCategory);
router.patch('/categories/:id', auth, adminAuth, updateCategory);
router.delete('/categories/:id', auth, adminAuth, deleteCategory);
router.get('/categories', listCategories);

// Посты (админ создание/публикация)
router.post('/', auth, adminAuth, createPost);
router.patch('/:id', auth, adminAuth, updatePost);
router.delete('/:id', auth, adminAuth, deletePost);
router.post('/:id/publish', auth, adminAuth, publishPost);

// Публичный список
router.get('/', optionalAuth, listPosts);

// Комментарии
router.get('/:id/comments', auth, listComments);
router.patch('/:postId/comments/:commentId', auth, updateComment);
router.delete('/:postId/comments/:commentId', auth, adminAuth, deleteComment);

// Действия пользователя
router.post('/views', auth, recordViews);
router.post('/:id/actions', auth, interact);

module.exports = router;
