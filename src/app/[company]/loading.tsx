// Above the app shell: shown while the (app) layout reads the company and its event log. The
// page skeleton inside picks its shape from the URL, so /acme/leader waits as an inbox.
import { ShellSkeleton } from "@/components/shell/ShellSkeleton";

export default function Loading() {
  return <ShellSkeleton />;
}
