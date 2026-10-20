"use server";
// OWNER: documents agent — stub from the base so the chat composer can import it. Replace the body, keep the signature.
/**
 * Upload one file (PDF or phone photo) from the chat composer or the case Documents tab.
 * FormData: file (File), threadId (string, optional), caseId (string, optional).
 * Saves the file to Storage + a documents row, reads every page (document_pages), then posts ONE assistant
 * message into the thread with a confirmation card (proposal) of the extracted parties/facts/requests/arguments.
 */
export async function uploadDocumentAction(formData: FormData): Promise<{ ok: boolean; documentId?: string; proposalId?: string | null; error?: string }> {
  void formData;
  return { ok: false, error: "رفع المستندات غير متاح بعد" };
}
