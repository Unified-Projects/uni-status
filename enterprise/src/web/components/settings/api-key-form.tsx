"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
} from "@uni-status/ui";
import { Key } from "lucide-react";

const apiKeyFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  scopes: z.array(z.enum(["read", "write", "delete", "admin"])).min(1, "Select at least one scope"),
  expiresIn: z.enum(["never", "30", "90", "365"]),
});

type ApiKeyFormValues = z.infer<typeof apiKeyFormSchema>;

interface ApiKeyFormProps {
  onSubmit: (data: { name: string; scopes: string[]; expiresIn?: number }) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

const SCOPES = [
  { value: "read", label: "Read", description: "Read access to monitors, incidents, and analytics" },
  { value: "write", label: "Write", description: "Create and update monitors, incidents, etc." },
  { value: "delete", label: "Delete", description: "Delete monitors, incidents, and other resources" },
  { value: "admin", label: "Admin", description: "Full administrative access" },
] as const;

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never expires" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
] as const;

export function ApiKeyForm({ onSubmit, onCancel, isSubmitting = false }: ApiKeyFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: {
      name: "",
      scopes: ["read"],
      expiresIn: "never",
    },
  });

  const selectedScopes = watch("scopes");
  const selectedExpiry = watch("expiresIn");

  const handleScopeToggle = (scope: "read" | "write" | "delete" | "admin") => {
    const current = selectedScopes || [];
    if (current.includes(scope)) {
      setValue("scopes", current.filter((s) => s !== scope) as ("read" | "write" | "delete" | "admin")[]);
    } else {
      setValue("scopes", [...current, scope]);
    }
  };

  const onFormSubmit = (data: ApiKeyFormValues) => {
    const expiresIn = data.expiresIn === "never" ? undefined : parseInt(data.expiresIn) * 24 * 60 * 60 * 1000;
    onSubmit({
      name: data.name,
      scopes: data.scopes,
      expiresIn,
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="name"
            placeholder="My API Key"
            className="pl-10"
            {...register("name")}
          />
        </div>
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-3">
        <Label>Permissions</Label>
        <div className="space-y-3">
          {SCOPES.map((scope) => (
            <div key={scope.value} className="flex items-start space-x-3">
              <Checkbox
                id={`scope-${scope.value}`}
                checked={selectedScopes.includes(scope.value)}
                onCheckedChange={() => handleScopeToggle(scope.value)}
              />
              <div className="grid gap-0.5 leading-none">
                <label
                  htmlFor={`scope-${scope.value}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {scope.label}
                </label>
                <p className="text-xs text-muted-foreground">
                  {scope.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        {errors.scopes && (
          <p className="text-sm text-destructive">{errors.scopes.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="expiresIn">Expiration</Label>
        <Select
          value={selectedExpiry}
          onValueChange={(value) => setValue("expiresIn", value as "never" | "30" | "90" | "365")}
        >
          <SelectTrigger id="expiresIn">
            <SelectValue placeholder="Select expiration" />
          </SelectTrigger>
          <SelectContent>
            {EXPIRY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create API Key"}
        </Button>
      </div>
    </form>
  );
}
