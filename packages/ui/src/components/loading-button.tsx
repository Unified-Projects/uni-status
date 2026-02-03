import * as React from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { cn } from "../lib/utils";

export interface LoadingButtonProps extends ButtonProps {
  isLoading?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  successDuration?: number;
  errorDuration?: number;
  loadingText?: string;
  successText?: string;
  errorText?: string;
}

export const LoadingButton = React.forwardRef<
  HTMLButtonElement,
  LoadingButtonProps
>(
  (
    {
      children,
      isLoading = false,
      isSuccess = false,
      isError = false,
      successDuration = 3000,
      errorDuration = 5000,
      loadingText,
      successText,
      errorText,
      disabled,
      className,
      variant,
      ...props
    },
    ref
  ) => {
    const [showSuccess, setShowSuccess] = React.useState(false);
    const [showError, setShowError] = React.useState(false);

    React.useEffect(() => {
      if (isSuccess) {
        setShowSuccess(true);
        const timer = setTimeout(() => {
          setShowSuccess(false);
        }, successDuration);
        return () => clearTimeout(timer);
      }
    }, [isSuccess, successDuration]);

    React.useEffect(() => {
      if (isError) {
        setShowError(true);
        const timer = setTimeout(() => {
          setShowError(false);
        }, errorDuration);
        return () => clearTimeout(timer);
      }
    }, [isError, errorDuration]);

    const getContent = () => {
      if (isLoading) {
        return (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {loadingText || children}
          </>
        );
      }

      if (showSuccess) {
        return (
          <>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {successText || "Success"}
          </>
        );
      }

      if (showError) {
        return (
          <>
            <XCircle className="mr-2 h-4 w-4" />
            {errorText || "Failed"}
          </>
        );
      }

      return children;
    };

    const getVariant = () => {
      if (showSuccess) return "default";
      if (showError) return "destructive";
      return variant;
    };

    const getClassName = () => {
      return cn(
        "transition-all duration-200",
        showSuccess &&
          "bg-green-600 hover:bg-green-700 text-white border-green-600",
        className
      );
    };

    return (
      <Button
        ref={ref}
        disabled={disabled || isLoading || showSuccess || showError}
        variant={getVariant()}
        className={getClassName()}
        {...props}
      >
        {getContent()}
      </Button>
    );
  }
);

LoadingButton.displayName = "LoadingButton";
