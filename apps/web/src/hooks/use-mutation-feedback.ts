import { useEffect, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { toast } from "@uni-status/ui";

export interface MutationFeedbackConfig {
  successMessage?: string;
  errorMessage?: string;
  showToast?: boolean;
  showInline?: boolean;
  autoDismissInline?: boolean;
  toastDuration?: number;
}

export interface MutationFeedbackState {
  showSuccess: boolean;
  showError: boolean;
  message: string;
  dismissInline: () => void;
}

export function useMutationFeedback<TData = unknown, TError = Error, TVariables = void>(
  mutation: UseMutationResult<TData, TError, TVariables>,
  config: MutationFeedbackConfig = {}
): MutationFeedbackState {
  const {
    successMessage = "Changes saved successfully",
    errorMessage = "An error occurred. Please try again.",
    showToast = true,
    showInline = true,
    autoDismissInline = true,
    toastDuration = 3000,
  } = config;

  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (mutation.isSuccess && !mutation.isPending) {
      if (showToast) {
        toast.success(successMessage, {
          duration: toastDuration,
        });
      }
      if (showInline) {
        setMessage(successMessage);
        setShowSuccess(true);
        setShowError(false);

        if (autoDismissInline) {
          const timer = setTimeout(() => {
            setShowSuccess(false);
          }, 5000);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [mutation.isSuccess, mutation.isPending, successMessage, showToast, showInline, autoDismissInline, toastDuration]);

  useEffect(() => {
    if (mutation.isError && !mutation.isPending) {
      const errorMsg = mutation.error instanceof Error
        ? mutation.error.message
        : errorMessage;

      if (showToast) {
        toast.error(errorMsg, {
          duration: toastDuration,
        });
      }
      if (showInline) {
        setMessage(errorMsg);
        setShowError(true);
        setShowSuccess(false);
      }
    }
  }, [mutation.isError, mutation.isPending, mutation.error, errorMessage, showToast, showInline, toastDuration]);

  const dismissInline = () => {
    setShowSuccess(false);
    setShowError(false);
    mutation.reset();
  };

  return {
    showSuccess,
    showError,
    message,
    dismissInline,
  };
}
