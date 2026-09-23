// Shown inside the app shell while a page segment streams in (slow network or slow device).
// No delay: on navigation the old page is already gone, so a delayed skeleton would mean a blank.
import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton delay={false} />;
}
