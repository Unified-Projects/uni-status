import * as React from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription } from "./alert";
import { cn } from "../lib/utils";

export interface FormFeedbackProps {
  type: "success" | "error";
  message: string;
  visible?: boolean;
  onDismiss?: () => void;
  autoDismiss?: boolean;
  autoDismissDuration?: number;
  className?: string;
}

export const FormFeedback = React.forwardRef<HTMLDivElement, FormFeedbackProps>(
  (
    {
      type,
      message,
      visible = true,
      onDismiss,
      autoDismiss = true,
      autoDismissDuration = 5000,
      className,
    },
    ref
  ) => {
    const [isVisible, setIsVisible] = React.useState(visible);

    React.useEffect(() => {
      setIsVisible(visible);
    }, [visible]);

    React.useEffect(() => {
      if (autoDismiss && isVisible && type === "success") {
        const timer = setTimeout(() => {
          setIsVisible(false);
          onDismiss?.();
        }, autoDismissDuration);
        return () => clearTimeout(timer);
      }
    }, [autoDismiss, autoDismissDuration, isVisible, type, onDismiss]);

    if (!isVisible) return null;

    const Icon = type === "success" ? CheckCircle2 : AlertCircle;
    const alertVariant = type === "success" ? "default" : "destructive";

    return (
      <Alert
        ref={ref}
        variant={alertVariant}
        className={cn(
          "animate-in slide-in-from-bottom-2 duration-300",
          type === "success" &&
            "border-green-200 bg-green-50 text-green-900 dark:border-green-900/50 dark:bg-green-900/10 dark:text-green-400",
          className
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <AlertDescription className="flex-1">{message}</AlertDescription>
          </div>
          {onDismiss && (
            <button
              onClick={() => {
                setIsVisible(false);
                onDismiss();
              }}
              className="opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </Alert>
    );
  }
);

FormFeedback.displayName = "FormFeedback";
