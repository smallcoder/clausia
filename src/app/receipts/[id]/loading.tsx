import { Bar } from "@/components/shell/PageSkeleton";

/** The receipt is outside the app shell: only the paper's shapes. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="جارٍ التحميل" className="skel-shimmer mx-auto w-full max-w-page space-y-4 px-4 py-10">
      <Bar w="40%" h={28} className="rounded-md" />
      <Bar w="100%" h={12} /><Bar w="85%" h={12} /><Bar w="60%" h={12} />
    </div>
  );
}
