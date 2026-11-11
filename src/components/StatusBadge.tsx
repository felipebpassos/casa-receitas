import type { RecipeStatus } from '@/lib/types';
import { Badge } from './ui';

/** Situação da receita na biblioteca pública (nada para receitas privadas). */
export function StatusBadge({ status }: { status: RecipeStatus }) {
  switch (status) {
    case 'PENDING':
      return <Badge label="em análise" tone="warning" />;
    case 'APPROVED':
      return <Badge label="pública" tone="success" />;
    case 'REJECTED':
      return <Badge label="recusada" tone="danger" />;
    default:
      return null;
  }
}
