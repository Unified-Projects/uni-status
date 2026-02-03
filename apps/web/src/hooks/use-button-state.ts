import { useEffect, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

export interface ButtonStateConfig {
  successDuration?: number;
  errorDuration?: number;
}

export type ButtonState = "idle" | "loading" | "success" | "error";

export interface ButtonStateReturn {
  state: ButtonState;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  reset: () => void;
}

export function useButtonState<TData = unknown, TError = Error, TVariables = void>(
  mutation: UseMutationResult<TData, TError, TVariables>,
  config: ButtonStateConfig = {}
): ButtonStateReturn {
  const {
    successDuration = 3000,
    errorDuration = 5000,
  } = config;

  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (mutation.isSuccess && !mutation.isPending) {
      setShowSuccess(true);
      setShowError(false);
      const timer = setTimeout(() => {
        setShowSuccess(false);
        mutation.reset();
      }, successDuration);
      return () => clearTimeout(timer);
    }
  }, [mutation.isSuccess, mutation.isPending, successDuration]);

  useEffect(() => {
    if (mutation.isError && !mutation.isPending) {
      setShowError(true);
      setShowSuccess(false);
      const timer = setTimeout(() => {
        setShowError(false);
        mutation.reset();
      }, errorDuration);
      return () => clearTimeout(timer);
    }
  }, [mutation.isError, mutation.isPending, errorDuration]);

  const getState = (): ButtonState => {
    if (mutation.isPending) return "loading";
    if (showSuccess) return "success";
    if (showError) return "error";
    return "idle";
  };

  const reset = () => {
    setShowSuccess(false);
    setShowError(false);
    mutation.reset();
  };

  return {
    state: getState(),
    isLoading: mutation.isPending,
    isSuccess: showSuccess,
    isError: showError,
    reset,
  };
}
