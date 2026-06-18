import React from 'react';

export function useDebouncedQueryInvalidation(queryClient, queryKeys, delay = 1000, onInvalidate) {
  const timeoutRef = React.useRef(null);
  const latestRef = React.useRef({ onInvalidate, queryKeys });

  React.useEffect(() => {
    latestRef.current = { onInvalidate, queryKeys };
  }, [onInvalidate, queryKeys]);

  React.useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
  }, []);

  return React.useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      latestRef.current.queryKeys.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });
      latestRef.current.onInvalidate?.();
    }, delay);
  }, [delay, queryClient]);
}
