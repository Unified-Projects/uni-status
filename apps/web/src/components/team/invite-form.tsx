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
} from "@uni-status/ui";
import { Mail, Send } from "lucide-react";
import { MemberRoleBadge, type MemberRole } from "./member-role-badge";

const inviteFormSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["admin", "member", "viewer"]),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

interface InviteFormProps {
  onSubmit: (data: InviteFormValues) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

const INVITABLE_ROLES: { value: MemberRole; description: string }[] = [
  { value: "admin", description: "Can manage team and settings" },
  { value: "member", description: "Can create and manage monitors" },
  { value: "viewer", description: "Read-only access to data" },
];

export function InviteForm({ onSubmit, onCancel, isSubmitting = false }: InviteFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: // @ts-ignore Zod v4 compatibility
    zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      role: "member",
    },
  });

  const selectedRole = watch("role");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            placeholder="colleague@company.com"
            className="pl-10"
            {...register("email")}
          />
        </div>
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select
          value={selectedRole}
          onValueChange={(value) => setValue("role", value as "admin" | "member" | "viewer")}
        >
          <SelectTrigger id="role">
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            {INVITABLE_ROLES.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                <div className="flex items-center gap-2">
                  <MemberRoleBadge role={role.value} />
                  <span className="text-xs text-muted-foreground">
                    - {role.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.role && (
          <p className="text-sm text-destructive">{errors.role.message}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          <Send className="mr-2 h-4 w-4" />
          {isSubmitting ? "Sending..." : "Send Invitation"}
        </Button>
      </div>
    </form>
  );
}
