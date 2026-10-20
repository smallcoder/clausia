// Confirm / reject for a suggested item. Plain server-action forms: work without client JS.
import { reviewItem } from "@/app/(app)/cases/actions";
import { Button } from "@/components/ui";

export function ReviewButtons({ table, id, caseId }: { table: string; id: string; caseId: string }) {
  return (
    <div className="flex items-center gap-2">
      <form action={reviewItem}>
        <input type="hidden" name="table" value={table} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="status" value="confirmed" />
        <Button size="sm">تأكيد</Button>
      </form>
      <form action={reviewItem}>
        <input type="hidden" name="table" value={table} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="status" value="rejected" />
        <Button size="sm" variant="secondary">رفض</Button>
      </form>
    </div>
  );
}
