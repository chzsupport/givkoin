const { isAdminEmail } = require('../utils/accountRole');

const adminAuth = (req, res, next) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }
  if (user.role !== 'admin' || !isAdminEmail(user.email)) {
    return res.status(403).json({ message: 'Требуется роль администратора' });
  }
  return next();
};

module.exports = adminAuth;
