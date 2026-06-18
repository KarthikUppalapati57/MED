import { useEffect, useRef, useState } from 'react';

export function useInView(options = {}) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(element);
    return () => {
      observer.unobserve(element);
    };
  }, [options.root, options.rootMargin, options.threshold]);

  return { ref, isIntersecting };
}
