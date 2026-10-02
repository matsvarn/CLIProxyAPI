import type { ReactNode } from 'react';
import { FIELDS_ROOT_CLASS } from './fields/FieldPrimitives';
import styles from './SectionCard.module.scss';

export type SectionCardProps = {
  /** Set on first-mount entrance only; tab switches never replay. */
  animateIn?: boolean;
  children: ReactNode;
};

/** Plain bordered panel; the surrounding tab already names the group. */
export function SectionCard({ animateIn = false, children }: SectionCardProps) {
  return (
    <section className={`${styles.card} ${animateIn ? styles.cardEnter : ''}`}>
      <div className={`${styles.content} ${FIELDS_ROOT_CLASS}`}>{children}</div>
    </section>
  );
}
