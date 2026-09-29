export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString('ko-KR');
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function getAgentColor(category: string): string {
  const colors: Record<string, string> = {
    '메타': '#6366f1',
    '개발': '#10b981',
    '품질': '#f59e0b',
    '설계': '#8b5cf6',
    '인프라': '#06b6d4',
    '문서': '#64748b',
    '데이터': '#ec4899',
    '비즈니스': '#f97316',
  };
  return colors[category] ?? '#6366f1';
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'idle': return '#10b981';
    case 'busy': return '#f59e0b';
    case 'error': return '#ef4444';
    case 'offline': return '#64748b';
    default: return '#64748b';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'idle': return '대기중';
    case 'busy': return '작업중';
    case 'error': return '오류';
    case 'offline': return '오프라인';
    default: return '알 수 없음';
  }
}

export function getProviderLabel(provider: string): string {
  switch (provider) {
    case 'claude': return 'Claude';
    case 'codex': return 'Codex';
    case 'gemini': return 'Gemini';
    default: return provider;
  }
}
