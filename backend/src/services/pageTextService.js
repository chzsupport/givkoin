const {
  getStaticPagesContent,
  syncStaticPagesContent,
} = require('./staticPageContentService');

async function getPageTextBundle() {
  return getStaticPagesContent();
}

async function savePageTextBundle(payload, userId = null) {
  return syncStaticPagesContent(payload, userId);
}

module.exports = {
  getPageTextBundle,
  savePageTextBundle,
};
