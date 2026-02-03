"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  LoadingButton,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@uni-status/ui";
import { Building2, Link2, Globe } from "lucide-react";
import type { Organization } from "@/lib/api-client";
import { ImageUpload } from "@/components/ui/image-upload";

const orgSettingsSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  slug: z.string().min(1, "Slug is required").max(50, "Slug must be 50 characters or less").regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  logoUrl: z.string().optional().or(z.literal("")),
  timezone: z.string().optional(),
});

type OrgSettingsValues = z.infer<typeof orgSettingsSchema>;

interface OrgSettingsFormProps {
  organization: Organization;
  onSubmit: (data: Partial<OrgSettingsValues>) => void;
  isSubmitting?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
}

const COMMON_TIMEZONES = [
  { value: "Europe/London", label: "London (UK)" },
  { value: "Europe/Dublin", label: "Dublin (Ireland)" },
  { value: "Europe/Paris", label: "Paris (EU)" },
  { value: "Europe/Berlin", label: "Berlin (EU)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (EU)" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York (US)" },
  { value: "America/Chicago", label: "Chicago (US)" },
  { value: "America/Denver", label: "Denver (US)" },
  { value: "America/Los_Angeles", label: "Los Angeles (US)" },
  { value: "Asia/Tokyo", label: "Tokyo (JP)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney (AU)" },
];

export function OrgSettingsForm({
  organization,
  onSubmit,
  isSubmitting = false,
  isSuccess = false,
  isError = false,
}: OrgSettingsFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<OrgSettingsValues>({
    resolver: zodResolver(orgSettingsSchema) as any,
    defaultValues: {
      name: organization.name,
      slug: organization.slug,
      logoUrl: organization.logoUrl || "",
      timezone: "Europe/London",
    },
  });

  const selectedTimezone = watch("timezone");
  const logoUrl = watch("logoUrl");

  const onFormSubmit = (data: OrgSettingsValues) => {
    onSubmit({
      name: data.name,
      slug: data.slug,
      logoUrl: data.logoUrl || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Organisation Name</Label>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="name"
            placeholder="My Organisation"
            className="pl-10"
            {...register("name")}
          />
        </div>
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Organisation Slug</Label>
        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="slug"
            placeholder="my-organisation"
            className="pl-10"
            {...register("slug")}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Used in URLs. Changing this may break existing links.
        </p>
        {errors.slug && (
          <p className="text-sm text-destructive">{errors.slug.message}</p>
        )}
      </div>

      <ImageUpload
        label="Organisation Logo"
        description="Upload a logo for your organisation. This will appear in the dashboard and status pages."
        value={logoUrl}
        onChange={(url) => setValue("logoUrl", url, { shouldDirty: true })}
        disabled={isSubmitting}
      />

      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Select
          value={selectedTimezone}
          onValueChange={(value) => setValue("timezone", value, { shouldDirty: true })}
        >
          <SelectTrigger id="timezone">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Select timezone" />
            </div>
          </SelectTrigger>
          <SelectContent>
            {COMMON_TIMEZONES.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-end pt-4">
        <LoadingButton
          type="submit"
          disabled={!isDirty}
          isLoading={isSubmitting}
          isSuccess={isSuccess}
          isError={isError}
          loadingText="Saving..."
          successText="Saved"
          errorText="Save Failed"
        >
          Save Changes
        </LoadingButton>
      </div>
    </form>
  );
}
