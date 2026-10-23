/** A page that comes in a later step of the restructure (الموكلين, المكتبة): its title and «قريباً». No content yet. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 pt-6 sm:px-10 xl:pt-10">
      <h1 className="text-xl font-bold text-title xl:text-page-title">{title}</h1>
      <p className="mt-4 text-md text-text-3">قريباً</p>
    </div>
  );
}
