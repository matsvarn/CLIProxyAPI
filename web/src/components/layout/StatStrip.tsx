import type { ReactNode } from 'react';
import styles from './StatStrip.module.scss';

export interface StatCell {
  label: string;
  value: ReactNode;
  /** Explanation lives in the label tooltip instead of taking up layout. */
  hint?: string;
  danger?: boolean;
}

/**
 * One bordered panel of equal stat cells split by vertical hairlines:
 * 12px muted label above a 24px tabular-nums value.
 */
export function StatStrip({ cells }: { cells: StatCell[] }) {
  return (
    <div className={styles.strip}>
      {cells.map((cell, index) => (
        <div key={index} className={styles.cell}>
          <span className={styles.label} title={cell.hint}>
            {cell.label}
          </span>
          <span className={`${styles.value} ${cell.danger ? styles.valueDanger : ''}`}>
            {cell.value}
          </span>
        </div>
      ))}
    </div>
  );
}
