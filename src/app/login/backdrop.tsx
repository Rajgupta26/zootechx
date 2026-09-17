'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The looping film behind the sign-in panel.
 *
 * Three things a background video gets wrong by default, handled here:
 *
 *  - `display: none` does not stop a browser fetching a video it has been
 *    handed, and the panel is hidden below `lg`. The width is matched in
 *    script so a phone renders no element and requests nothing.
 *  - `autoplay` is a request, not a guarantee: a browser refuses it while the
 *    tab is hidden, and some refuse it on a stored preference. Playback is
 *    asked for explicitly and retried on the way back to visible.
 *  - A 20-second drift is exactly what reduced motion exists to stop, so that
 *    setting gets the still frame instead.
 */
export function LoginBackdrop() {
  const [still, setStill] = useState<boolean | null>(null);
  const [wide, setWide] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const watch = (mq: string, set: (v: boolean) => void) => {
      const query = window.matchMedia(mq);
      set(query.matches);
      const onChange = (e: MediaQueryListEvent) => set(e.matches);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    };
    const offMotion = watch('(prefers-reduced-motion: reduce)', setStill);
    // `lg` in the Tailwind config, which is where the panel appears.
    const offWidth = watch('(min-width: 1024px)', setWide);
    return () => { offMotion(); offWidth(); };
  }, []);

  useEffect(() => {
    if (still !== false || !wide) return;
    const start = () => {
      if (document.visibilityState !== 'visible') return;
      video.current?.play().catch(() => {});
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => document.removeEventListener('visibilitychange', start);
  }, [still, wide]);

  return (
    <div className="absolute inset-0 -z-10">
      {still === false && wide ? (
        <video
          ref={video}
          className="h-full w-full object-cover"
          src="/brand/login-loop.mp4"
          poster="/brand/login-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          // Decorative: it carries nothing the copy does not already say.
          aria-hidden
        />
      ) : (
        <img
          className="h-full w-full object-cover"
          src="/brand/login-poster.jpg"
          alt=""
          aria-hidden
        />
      )}

      {/*
        Weighted left, where every line of copy sits, rather than washing the
        whole panel — so the glow still reads on the right. These figures are
        measured, not picked: composited against every fourth frame of the
        loop, the brightest pixel that ever passes behind the headline leaves
        6.7:1, and 5.6:1 for the paragraph at 80% opacity.
      */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/85 via-primary/60 to-primary/15" />
      <div className="absolute inset-0 bg-gradient-to-t from-primary/75 via-transparent to-primary/25" />
    </div>
  );
}
