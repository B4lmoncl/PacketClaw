/**
 * Rechtsklick-Kontextmenü auf Policy-Zeilen — wie im FortiOS-GUI (Edit,
 * Insert Empty Policy Above/Below, Clone, Status, Delete). Portal an der
 * Cursorposition, an den Viewport geklemmt, Escape/Klick-außerhalb schließt.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  /** rot einfärben (Delete) */
  danger?: boolean;
  /** Trennlinie oberhalb dieses Eintrags */
  divider?: boolean;
  onClick: () => void;
}

export interface ContextMenuState {
  policyId: number;
  x: number;
  y: number;
}

export function PolicyContextMenu({
  state,
  items,
  onClose,
}: {
  state: ContextMenuState;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: state.x, top: state.y });

  // An den Viewport klemmen, damit das Menü nie abgeschnitten wird
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(state.x, window.innerWidth - rect.width - 4)),
      top: Math.max(4, Math.min(state.y, window.innerHeight - rect.height - 4)),
    });
  }, [state.x, state.y]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  // Ersten Eintrag fokussieren (Tastatur-Navigation ab Öffnen)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, []);

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      aria-label={`Policy ${state.policyId}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ position: 'fixed', left: pos.left, top: pos.top, transformOrigin: 'top left' }}
      className="z-50 min-w-[200px] rounded-panel border border-line bg-panel py-1 shadow-xl shadow-black/50"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <div key={item.key}>
          {item.divider && <div className="mx-2 my-1 border-t border-line/60" />}
          <button
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick();
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors ${
              item.disabled
                ? 'cursor-not-allowed text-dim/40'
                : item.danger
                  ? 'text-deny/90 hover:bg-deny/10 hover:text-deny'
                  : 'text-ink hover:bg-white/[0.06]'
            } focus-visible:bg-white/[0.06] focus-visible:outline-none`}
          >
            {item.icon && (
              <span aria-hidden className="w-4 text-center text-dim">
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        </div>
      ))}
    </motion.div>,
    document.body,
  );
}
