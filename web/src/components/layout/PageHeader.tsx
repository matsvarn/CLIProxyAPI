import type { ReactNode } from 'react';
import styles from './PageHeader.module.scss';

interface PageHeaderProps {
  title: string;
  /** Optional one-line description; only for text that prevents a mistake. */
  description?: string;
  /** Plain-text meta line, e.g. "3 accounts · 1 needs attention". */
  meta?: ReactNode;
  actions?: ReactNode;
}

/**
 * Shared page header: title + optional meta/description, actions aligned to
 * the right of the title block. Replaces per-page header implementations.
 */
export function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.copy}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
        {meta && <div className={styles.meta}>{meta}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
