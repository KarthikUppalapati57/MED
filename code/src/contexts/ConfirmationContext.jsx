import React, { createContext, useCallback, useState } from 'react';

export const ConfirmationContext = createContext();

export const ConfirmationProvider = ({ children }) => {
  const [state, setState] = useState({
    isOpen: false,
    config: null,
    resolve: null,
  });

  const show = useCallback(
    (config) => {
      return new Promise((resolve) => {
        setState({
          isOpen: true,
          config,
          resolve,
        });
      });
    },
    []
  );

  const hide = useCallback((result = false) => {
    setState((prevState) => {
      if (prevState.resolve) {
        prevState.resolve(result);
      }
      return {
        isOpen: false,
        config: null,
        resolve: null,
      };
    });
  }, []);

  const value = {
    ...state,
    show,
    hide,
  };

  return (
    <ConfirmationContext.Provider value={value}>
      {children}
    </ConfirmationContext.Provider>
  );
};
