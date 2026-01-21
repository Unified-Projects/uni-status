import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@uni-status/ui";

export default function StatusPageNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">Status Page Not Found</h1>
        <p className="mt-2 text-muted-foreground max-w-md">
          The status page you're looking for doesn't exist or hasn't been published yet.
        </p>
        <div className="mt-6">
          <Button asChild variant="outline">
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
