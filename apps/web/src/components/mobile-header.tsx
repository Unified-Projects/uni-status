"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { useSidebarStore } from "@/stores/sidebar-store";

export function MobileHeader() {
  const setOpen = useSidebarStore((state) => state.setOpen);

  return (
    <div className="lg:hidden sticky top-0 z-30 flex items-center gap-4 bg-background border-b px-4 py-3">
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg hover:bg-muted"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link href="/dashboard" className="flex items-center gap-2">
        <Image src="/icon.svg" alt="Uni-Status" width={24} height={24} />
        <span className="font-semibold text-[#065f46] dark:text-[#34d399]">Uni-Status</span>
      </Link>
    </div>
  );
}
