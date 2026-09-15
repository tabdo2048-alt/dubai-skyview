import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects_/$slug/tour/$tourId")({
  ssr: false,
  component: Outlet,
});
