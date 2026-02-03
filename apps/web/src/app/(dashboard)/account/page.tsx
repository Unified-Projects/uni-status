"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  User,
  Shield,
  Bell,
  Palette,
  Eye,
  EyeOff,
  Save,
  Lock,
  Moon,
  Sun,
  Monitor,
  Trash2,
  AlertTriangle,
  Smartphone,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import {
  Button,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Separator,
  Alert,
  AlertDescription,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@uni-status/ui";
import { useSession } from "@uni-status/auth/client";
import { authClient } from "@uni-status/auth/client";
import { LoadingState } from "@/components/ui/loading-state";
import { ImageUpload } from "@/components/ui/image-upload";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

const TIMEZONES = [
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

export default function AccountPage() {
  const { data: session, isPending: sessionLoading } = useSession();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState(session?.user?.image || "");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 2FA state
  const [twoFactorDialogOpen, setTwoFactorDialogOpen] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState<"password" | "qrcode" | "verify" | "backup">("password");
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorData, setTwoFactorData] = useState<{ totpURI?: string; backupCodes?: string[] } | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [disableTwoFactorDialogOpen, setDisableTwoFactorDialogOpen] = useState(false);
  const [disableTwoFactorPassword, setDisableTwoFactorPassword] = useState("");
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  // Check if 2FA is enabled from session
  const isTwoFactorEnabled = (session?.user as any)?.twoFactorEnabled ?? false;

  // Preferences state (would be saved to backend in real implementation)
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [timezone, setTimezone] = useState("Europe/London");
  const [emailNotifications, setEmailNotifications] = useState({
    incidents: true,
    maintenance: true,
    sloBreaches: true,
    weeklyReport: false,
  });

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
  } = useForm<ProfileFormData>({
    resolver: // @ts-expect-error Zod v4 compatibility
    zodResolver(profileSchema),
    defaultValues: {
      name: session?.user?.name || "",
      email: session?.user?.email || "",
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors },
    reset: resetPasswordForm,
  } = useForm<PasswordFormData>({
    resolver: // @ts-expect-error Zod v4 compatibility
    zodResolver(passwordSchema),
  });

  const onProfileSubmit = async (data: ProfileFormData) => {
    setProfileSaving(true);
    setProfileSuccess(false);
    try {
      await authClient.updateUser({
        name: data.name,
        image: profileImage || undefined,
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to update profile:", error);
    } finally {
      setProfileSaving(false);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    setPasswordSaving(true);
    setPasswordSuccess(false);
    setPasswordError(null);
    try {
      await authClient.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setPasswordSuccess(true);
      resetPasswordForm();
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (error: any) {
      setPasswordError(error?.message || "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE") {
      setDeleteError("Please type DELETE to confirm");
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      // Call the auth client to delete the account
      await authClient.deleteUser();
      // Redirect to home or sign out
      window.location.href = "/";
    } catch (error: any) {
      setDeleteError(error?.message || "Failed to delete account. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEnableTwoFactor = async () => {
    setTwoFactorLoading(true);
    setTwoFactorError(null);
    try {
      const result = await authClient.twoFactor.enable({
        password: twoFactorPassword,
      });
      if (result.data) {
        setTwoFactorData({
          totpURI: result.data.totpURI,
          backupCodes: result.data.backupCodes,
        });
        setTwoFactorStep("qrcode");
      }
    } catch (error: any) {
      setTwoFactorError(error?.message || "Failed to enable 2FA. Check your password.");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    setTwoFactorLoading(true);
    setTwoFactorError(null);
    try {
      await authClient.twoFactor.verifyTotp({
        code: twoFactorCode,
      });
      setTwoFactorStep("backup");
    } catch (error: any) {
      setTwoFactorError(error?.message || "Invalid verification code. Please try again.");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    setTwoFactorLoading(true);
    setTwoFactorError(null);
    try {
      await authClient.twoFactor.disable({
        password: disableTwoFactorPassword,
      });
      setDisableTwoFactorDialogOpen(false);
      setDisableTwoFactorPassword("");
      // Refresh the page to update session
      window.location.reload();
    } catch (error: any) {
      setTwoFactorError(error?.message || "Failed to disable 2FA. Check your password.");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleCopyBackupCodes = () => {
    if (twoFactorData?.backupCodes) {
      navigator.clipboard.writeText(twoFactorData.backupCodes.join("\n"));
      setCopiedBackupCodes(true);
      setTimeout(() => setCopiedBackupCodes(false), 2000);
    }
  };

  const handleCloseTwoFactorDialog = () => {
    setTwoFactorDialogOpen(false);
    setTwoFactorStep("password");
    setTwoFactorPassword("");
    setTwoFactorCode("");
    setTwoFactorData(null);
    setTwoFactorError(null);
    if (twoFactorStep === "backup") {
      // Refresh page if we completed setup
      window.location.reload();
    }
  };

  if (sessionLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your account preferences and security
          </p>
        </div>
        <LoadingState variant="card" count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">
          Manage your account preferences and security
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Palette className="h-4 w-4" />
            Preferences
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and profile settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
                <div className="space-y-4 mb-6">
                  <Label>Profile Picture</Label>
                  <div className="flex items-start gap-4">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-medium text-primary-foreground overflow-hidden flex-shrink-0">
                      {profileImage || session?.user?.image ? (
                        <img
                          src={profileImage || session?.user?.image || ""}
                          alt={session?.user?.name || "User"}
                          className="h-20 w-20 object-cover"
                        />
                      ) : (
                        session?.user?.name?.charAt(0).toUpperCase() ||
                        session?.user?.email?.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <ImageUpload
                        value={profileImage}
                        onChange={setProfileImage}
                        description="Upload a profile picture. Square images work best."
                        maxSize={2}
                        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                      />
                    </div>
                  </div>
                  <div className="pt-2">
                    <h3 className="text-lg font-medium">{session?.user?.name}</h3>
                    <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      {...registerProfile("name")}
                      defaultValue={session?.user?.name || ""}
                    />
                    {profileErrors.name && (
                      <p className="text-sm text-destructive">{profileErrors.name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      {...registerProfile("email")}
                      defaultValue={session?.user?.email || ""}
                      disabled
                    />
                    <p className="text-xs text-muted-foreground">
                      Email cannot be changed
                    </p>
                  </div>
                </div>

                {profileSuccess && (
                  <Alert className="bg-green-500/10 border-green-500/20">
                    <AlertDescription className="text-green-600">
                      Profile updated successfully!
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end">
                  <Button type="submit" disabled={profileSaving}>
                    <Save className="mr-2 h-4 w-4" />
                    {profileSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      {...registerPassword("currentPassword")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordErrors.currentPassword && (
                    <p className="text-sm text-destructive">{passwordErrors.currentPassword.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      {...registerPassword("newPassword")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordErrors.newPassword && (
                    <p className="text-sm text-destructive">{passwordErrors.newPassword.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      {...registerPassword("confirmPassword")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordErrors.confirmPassword && (
                    <p className="text-sm text-destructive">{passwordErrors.confirmPassword.message}</p>
                  )}
                </div>

                {passwordError && (
                  <Alert variant="destructive">
                    <AlertDescription>{passwordError}</AlertDescription>
                  </Alert>
                )}

                {passwordSuccess && (
                  <Alert className="bg-green-500/10 border-green-500/20">
                    <AlertDescription className="text-green-600">
                      Password changed successfully!
                    </AlertDescription>
                  </Alert>
                )}

                <Button type="submit" disabled={passwordSaving}>
                  <Lock className="mr-2 h-4 w-4" />
                  {passwordSaving ? "Changing..." : "Change Password"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>
                Add an extra layer of security to your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Authenticator App</p>
                    <p className="text-sm text-muted-foreground">
                      {isTwoFactorEnabled
                        ? "Two-factor authentication is enabled"
                        : "Use an authenticator app for additional security"}
                    </p>
                  </div>
                </div>
                {isTwoFactorEnabled ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDisableTwoFactorDialogOpen(true)}
                  >
                    Disable
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTwoFactorDialogOpen(true)}
                  >
                    Enable
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Enable 2FA Dialog */}
          <Dialog open={twoFactorDialogOpen} onOpenChange={handleCloseTwoFactorDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {twoFactorStep === "password" && "Enable Two-Factor Authentication"}
                  {twoFactorStep === "qrcode" && "Scan QR Code"}
                  {twoFactorStep === "verify" && "Verify Code"}
                  {twoFactorStep === "backup" && "Save Backup Codes"}
                </DialogTitle>
                <DialogDescription>
                  {twoFactorStep === "password" && "Enter your password to begin 2FA setup."}
                  {twoFactorStep === "qrcode" && "Scan this QR code with your authenticator app."}
                  {twoFactorStep === "verify" && "Enter the 6-digit code from your authenticator app."}
                  {twoFactorStep === "backup" && "Save these backup codes in a safe place. You can use them if you lose access to your authenticator."}
                </DialogDescription>
              </DialogHeader>

              {twoFactorStep === "password" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="2fa-password">Password</Label>
                    <Input
                      id="2fa-password"
                      type="password"
                      value={twoFactorPassword}
                      onChange={(e) => setTwoFactorPassword(e.target.value)}
                      placeholder="Enter your password"
                    />
                  </div>
                  {twoFactorError && (
                    <Alert variant="destructive">
                      <AlertDescription>{twoFactorError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {twoFactorStep === "qrcode" && twoFactorData?.totpURI && (
                <div className="space-y-4">
                  <div className="flex justify-center p-4 bg-white rounded-lg">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFactorData.totpURI)}`}
                      alt="QR Code for 2FA"
                      className="w-48 h-48"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Can&apos;t scan? Enter this code manually in your app:
                  </p>
                  <code className="block p-2 bg-muted rounded text-xs text-center break-all">
                    {twoFactorData.totpURI.split("secret=")[1]?.split("&")[0]}
                  </code>
                </div>
              )}

              {twoFactorStep === "verify" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="2fa-code">Verification Code</Label>
                    <Input
                      id="2fa-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="text-center text-2xl tracking-widest font-mono"
                    />
                  </div>
                  {twoFactorError && (
                    <Alert variant="destructive">
                      <AlertDescription>{twoFactorError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {twoFactorStep === "backup" && twoFactorData?.backupCodes && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg font-mono text-sm">
                    {twoFactorData.backupCodes.map((code, i) => (
                      <div key={i} className="p-2 bg-background rounded text-center">
                        {code}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCopyBackupCodes}
                  >
                    {copiedBackupCodes ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Backup Codes
                      </>
                    )}
                  </Button>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Store these codes securely. Each code can only be used once.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              <DialogFooter>
                {twoFactorStep === "password" && (
                  <Button onClick={handleEnableTwoFactor} disabled={twoFactorLoading || !twoFactorPassword}>
                    {twoFactorLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Continue"
                    )}
                  </Button>
                )}
                {twoFactorStep === "qrcode" && (
                  <Button onClick={() => setTwoFactorStep("verify")}>
                    Next
                  </Button>
                )}
                {twoFactorStep === "verify" && (
                  <Button onClick={handleVerifyTwoFactor} disabled={twoFactorLoading || twoFactorCode.length !== 6}>
                    {twoFactorLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify"
                    )}
                  </Button>
                )}
                {twoFactorStep === "backup" && (
                  <Button onClick={handleCloseTwoFactorDialog}>
                    Done
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Disable 2FA Dialog */}
          <Dialog open={disableTwoFactorDialogOpen} onOpenChange={setDisableTwoFactorDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
                <DialogDescription>
                  Enter your password to disable 2FA. This will make your account less secure.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="disable-2fa-password">Password</Label>
                  <Input
                    id="disable-2fa-password"
                    type="password"
                    value={disableTwoFactorPassword}
                    onChange={(e) => setDisableTwoFactorPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </div>
                {twoFactorError && (
                  <Alert variant="destructive">
                    <AlertDescription>{twoFactorError}</AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDisableTwoFactorDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDisableTwoFactor}
                  disabled={twoFactorLoading || !disableTwoFactorPassword}
                >
                  {twoFactorLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Disabling...
                    </>
                  ) : (
                    "Disable 2FA"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Choose which notifications you want to receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Incident Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified when incidents are created or resolved
                  </p>
                </div>
                <Switch
                  checked={emailNotifications.incidents}
                  onCheckedChange={(checked) =>
                    setEmailNotifications({ ...emailNotifications, incidents: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Maintenance Windows</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified about scheduled maintenance
                  </p>
                </div>
                <Switch
                  checked={emailNotifications.maintenance}
                  onCheckedChange={(checked) =>
                    setEmailNotifications({ ...emailNotifications, maintenance: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">SLO Breach Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified when SLO error budgets are low or breached
                  </p>
                </div>
                <Switch
                  checked={emailNotifications.sloBreaches}
                  onCheckedChange={(checked) =>
                    setEmailNotifications({ ...emailNotifications, sloBreaches: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Weekly Summary Report</p>
                  <p className="text-sm text-muted-foreground">
                    Receive a weekly summary of your monitoring status
                  </p>
                </div>
                <Switch
                  checked={emailNotifications.weeklyReport}
                  onCheckedChange={(checked) =>
                    setEmailNotifications({ ...emailNotifications, weeklyReport: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize how the application looks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Theme</Label>
                <div className="flex gap-2">
                  <Button
                    variant={theme === "light" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("light")}
                    className="gap-2"
                  >
                    <Sun className="h-4 w-4" />
                    Light
                  </Button>
                  <Button
                    variant={theme === "dark" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("dark")}
                    className="gap-2"
                  >
                    <Moon className="h-4 w-4" />
                    Dark
                  </Button>
                  <Button
                    variant={theme === "system" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme("system")}
                    className="gap-2"
                  >
                    <Monitor className="h-4 w-4" />
                    System
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  All times will be displayed in your selected timezone
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6 border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible actions that affect your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delete Account</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete your account and all associated data
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Delete Account Confirmation Dialog */}
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Delete Account
                </DialogTitle>
                <DialogDescription className="space-y-4">
                  <p>
                    This action is <strong>permanent and cannot be undone</strong>. This will:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Delete your account and all personal information</li>
                    <li>Remove you from all organizations</li>
                    <li>Delete any organizations where you are the sole owner</li>
                    <li>Cancel any active subscriptions</li>
                  </ul>
                  <div className="pt-4 space-y-2">
                    <Label htmlFor="delete-confirm">
                      Type <strong>DELETE</strong> to confirm
                    </Label>
                    <Input
                      id="delete-confirm"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="DELETE"
                      className="font-mono"
                    />
                  </div>
                  {deleteError && (
                    <Alert variant="destructive">
                      <AlertDescription>{deleteError}</AlertDescription>
                    </Alert>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setDeleteConfirmation("");
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmation !== "DELETE"}
                >
                  {isDeleting ? "Deleting..." : "Delete My Account"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
