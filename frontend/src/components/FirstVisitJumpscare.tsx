import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import jumpscareImg from '../assets/test_im2.png';

function playStartleSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    void ctx.resume().then(() => {
      osc.start();
      osc.stop(ctx.currentTime + 0.42);
      window.setTimeout(() => void ctx.close(), 500);
    });
  } catch {
    /* ignore */
  }
}

function closeOverlay(setOn: (v: boolean) => void) {
  setOn(false);
}

/**
 * Full-screen startle after a short delay on every load / refresh.
 * With `prefers-reduced-motion: reduce`, the image still shows; animation and sound are skipped.
 * `?force_jumpscare=1` forces sound + motion styling even when Reduce Motion is on.
 */
export function FirstVisitJumpscare() {
  const [on, setOn] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Whether to use loud animation + sound for this reveal (set right before setOn(true)). */
  const intenseRef = useRef(false);

  useEffect(() => {
    if (on) panelRef.current?.focus({ preventScroll: true });
  }, [on]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const forceIntense = params.has('force_jumpscare');

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const intense = forceIntense || !reduceMotion;

    const delayMs = 1600;
    const visibleMs = 1800;

    const preload = new Image();
    preload.src = jumpscareImg;

    let dismissTimer: number | undefined;
    const showTimer = window.setTimeout(() => {
      intenseRef.current = intense;
      setOn(true);
      if (intense) playStartleSound();
      dismissTimer = window.setTimeout(() => closeOverlay(setOn), visibleMs);
    }, delayMs);

    return () => {
      window.clearTimeout(showTimer);
      if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
    };
  }, []);

  if (!on || typeof document === 'undefined') return null;

  const overlay = (
    <div
      ref={panelRef}
      className={`${intenseRef.current ? 'o1-jumpscare-overlay ' : ''}fixed inset-0 z-[2147483647] flex cursor-pointer flex-col bg-black text-center outline-none select-none`}
      role="dialog"
      aria-modal="true"
      aria-label="Surprise"
      onClick={() => closeOverlay(setOn)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          closeOverlay(setOn);
        }
      }}
      tabIndex={-1}
    >
      <img
        src={jumpscareImg}
        alt=""
        width={1024}
        height={1024}
        decoding="async"
        fetchPriority="high"
        draggable={false}
        className="pointer-events-none min-h-0 w-full flex-1 object-cover object-center"
        aria-hidden
      />
      <p className="shrink-0 bg-black/75 px-4 py-3 text-xs text-zinc-300">
        Click anywhere to continue
      </p>
    </div>
  );

  return createPortal(overlay, document.body);
}
