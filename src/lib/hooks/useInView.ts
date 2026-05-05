"use client";

import { useRef, useState, useCallback } from "react";

interface UseInViewOptions {
  threshold?: number;
  once?: boolean;
}

export function useInView<T extends Element = Element>(
  options: UseInViewOptions = {}
): { ref: (node: T | null) => void; inView: boolean } {
  const { threshold = 0.12, once = true } = options;
  const [inView, setInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: T | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) return;

      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setInView(true);
            if (once && observerRef.current) {
              observerRef.current.unobserve(node);
            }
          } else if (!once) {
            setInView(false);
          }
        },
        { threshold }
      );

      observerRef.current.observe(node);
    },
    [threshold, once]
  );

  return { ref, inView };
}
