"use client";

import type { LayoutType } from "@uni-status/shared";
import { ListLayout } from "./list-layout";
import { CardsLayout } from "./cards-layout";
import { SidebarLayout } from "./sidebar-layout";
import { SinglePageLayout } from "./single-page-layout";
import type { LayoutProps, PageData } from "./types";

interface LayoutWrapperProps extends LayoutProps {
  layout: LayoutType;
  // Additional props for full-page layouts
  fullPageProps?: PageData;
  notificationMessage?: string;
  notificationError?: string;
}

export function LayoutWrapper({
  layout,
  fullPageProps,
  notificationMessage,
  notificationError,
  ...props
}: LayoutWrapperProps) {
  switch (layout) {
    case "cards":
      return (
        <CardsLayout
          {...props}
          pageData={fullPageProps!}
          notificationMessage={notificationMessage}
          notificationError={notificationError}
        />
      );
    case "sidebar":
      return (
        <SidebarLayout
          {...props}
          pageData={fullPageProps!}
          notificationMessage={notificationMessage}
          notificationError={notificationError}
        />
      );
    case "single-page":
      return (
        <SinglePageLayout
          {...props}
          pageData={fullPageProps!}
          notificationMessage={notificationMessage}
          notificationError={notificationError}
        />
      );
    case "list":
    default:
      return <ListLayout {...props} />;
  }
}
