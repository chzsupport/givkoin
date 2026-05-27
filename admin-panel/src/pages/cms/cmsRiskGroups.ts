export const GROUP_SIGNAL_PREFIXES = ['shared_device:', 'shared_fingerprint:', 'shared_weak_fingerprint:', 'referral_cluster:'];

export function getGroupSignals(signals: any): string[] {
  if (!Array.isArray(signals)) return [];
  return signals
    .map((signal) => String(signal || '').trim())
    .filter((signal) => GROUP_SIGNAL_PREFIXES.some((prefix) => signal.startsWith(prefix)));
}

export function formatGroupSignal(signal: string) {
  if (signal.startsWith('shared_device:')) return `Общее устройство: ${signal.slice('shared_device:'.length)}`;
  if (signal.startsWith('shared_fingerprint:')) return `Общий отпечаток: ${signal.slice('shared_fingerprint:'.length)}`;
  if (signal.startsWith('shared_weak_fingerprint:')) return `Общий слабый отпечаток: ${signal.slice('shared_weak_fingerprint:'.length)}`;
  if (signal.startsWith('referral_cluster:')) return `Реферальный кластер: ${signal.slice('referral_cluster:'.length)}`;
  return signal;
}

export function buildRiskGroups(rows: any[]) {
  const byUserId = new Map<string, any>();
  const parents = new Map<string, string>();
  const signalOwners = new Map<string, Set<string>>();
  const groupIdOwners = new Map<string, Set<string>>();

  const ensure = (id: string) => {
    if (!id) return;
    if (!parents.has(id)) parents.set(id, id);
  };
  const find = (id: string): string => {
    const own = parents.get(id) || id;
    if (own === id) return own;
    const root = find(own);
    parents.set(id, root);
    return root;
  };
  const unite = (a: string, b: string) => {
    if (!a || !b) return;
    ensure(a);
    ensure(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parents.set(rb, ra);
  };

  for (const row of rows) {
    const userId = String(row?.user?._id || '').trim();
    if (!userId) continue;
    byUserId.set(userId, row);
    ensure(userId);
    const explicitGroupId = String(row?.groupId || '').trim();
    if (explicitGroupId) {
      if (!groupIdOwners.has(explicitGroupId)) groupIdOwners.set(explicitGroupId, new Set());
      groupIdOwners.get(explicitGroupId)?.add(userId);
    }
    for (const token of getGroupSignals(row?.signals)) {
      if (!signalOwners.has(token)) signalOwners.set(token, new Set());
      signalOwners.get(token)?.add(userId);
    }
  }

  for (const set of groupIdOwners.values()) {
    const ids = Array.from(set);
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i += 1) {
      unite(ids[0], ids[i]);
    }
  }

  for (const set of signalOwners.values()) {
    const ids = Array.from(set);
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i += 1) {
      unite(ids[0], ids[i]);
    }
  }

  for (const row of rows) {
    const userId = String(row?.user?._id || '').trim();
    if (!userId) continue;
    const related = Array.isArray(row?.relatedUsers) ? row.relatedUsers : [];
    for (const relatedUser of related) {
      const relatedId = String(relatedUser?._id || '').trim();
      if (relatedId && byUserId.has(relatedId)) {
        unite(userId, relatedId);
      }
    }
  }

  const clusters = new Map<string, Set<string>>();
  for (const id of byUserId.keys()) {
    const root = find(id);
    if (!clusters.has(root)) clusters.set(root, new Set());
    clusters.get(root)?.add(id);
  }

  const groups: any[] = [];
  for (const membersSet of clusters.values()) {
    const ids = Array.from(membersSet);
    const usersMap = new Map<string, any>();
    const emails = new Set<string>();
    const signals = new Set<string>();
    const evidence: any[] = [];
    const riskCaseIds: string[] = [];
    let latestTs = 0;
    let topRiskScore = 0;
    let topStatus = '';
    let topFreezeStatus = '';

    for (const userId of ids) {
      const row = byUserId.get(userId);
      if (!row) continue;
      const rowUser = row.user || {};
      usersMap.set(userId, {
        userId,
        nickname: String(rowUser.nickname || '').trim() || 'Пользователь',
        email: String(rowUser.email || '').trim().toLowerCase(),
        riskCaseId: String(row._id || ''),
      });
      const ownEmail = String(rowUser.email || '').trim().toLowerCase();
      if (ownEmail) emails.add(ownEmail);
      riskCaseIds.push(String(row._id || ''));
      for (const token of getGroupSignals(row.signals)) signals.add(token);
      for (const entry of Array.isArray(row?.evidence) ? row.evidence : []) evidence.push(entry);

      const related = Array.isArray(row.relatedUsers) ? row.relatedUsers : [];
      for (const rel of related) {
        const relId = String(rel?._id || '').trim();
        const relEmail = String(rel?.email || '').trim().toLowerCase();
        const key = relId || relEmail;
        if (!key) continue;
        if (!usersMap.has(key)) {
          usersMap.set(key, {
            userId: relId,
            nickname: String(rel?.nickname || '').trim() || 'Пользователь',
            email: relEmail,
            riskCaseId: '',
          });
        }
        if (relEmail) emails.add(relEmail);
      }

      const updatedAt = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;
      if (updatedAt > latestTs) latestTs = updatedAt;
      if (Number(row?.riskScore || 0) >= topRiskScore) {
        topRiskScore = Number(row?.riskScore || 0);
        topStatus = String(row?.status || '');
        topFreezeStatus = String(row?.freezeStatus || '');
      }
    }

    const users = Array.from(usersMap.values());
    if (users.length < 2) continue;
    const groupId = users
      .map((user) => String(user.userId || user.email || user.nickname))
      .sort()
      .join('|');

    groups.push({
      id: groupId,
      users,
      emails: Array.from(emails),
      signals: Array.from(signals),
      evidence,
      riskCaseIds: Array.from(new Set(riskCaseIds.filter(Boolean))),
      latestTs,
      riskScore: topRiskScore,
      status: topStatus,
      freezeStatus: topFreezeStatus,
    });
  }

  return groups.sort((a, b) => {
    if ((b.riskScore || 0) !== (a.riskScore || 0)) return (b.riskScore || 0) - (a.riskScore || 0);
    if (b.users.length !== a.users.length) return b.users.length - a.users.length;
    return (b.latestTs || 0) - (a.latestTs || 0);
  });
}
