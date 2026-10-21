/**
 * One shared loading pattern (owner item 18): the page's real layout as solid shapes — title, stats, then the
 * card or table shapes — on card + hairline tokens, with one calm shimmer and no spinners. The top bar comes
 * from the layout and stays; the composer shell stays at the bottom (inert until the page arrives).
 */
type Kind = "home" | "chat" | "case" | "roll" | "cases";

const Bar = ({ w, h = 12, className = "" }: { w: string; h?: number; className?: string }) => (
  <span aria-hidden className={`skel block ${className}`} style={{ width: w, height: h }} />
);

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[26px] border border-border-2 bg-card p-5 shadow-card sm:rounded-[28px] sm:p-6 ${className}`}>{children}</div>;
}

function Rows({ n, line = true }: { n: number; line?: boolean }) {
  return (
    <div>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`flex items-center gap-4 py-4 ${line && i ? "border-t border-[var(--hairline-v2)]" : ""}`}>
          <Bar w="28px" h={28} className="rounded-lg" />
          <div className="flex-1 space-y-2"><Bar w={`${62 - (i % 3) * 9}%`} h={13} /><Bar w={`${38 - (i % 2) * 8}%`} h={10} /></div>
          <Bar w="70px" h={10} className="hidden sm:block" />
        </div>
      ))}
    </div>
  );
}

function Header({ stats = 3, eyebrow = true }: { stats?: number; eyebrow?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 pt-4 sm:pt-8">
      <div className="space-y-3">
        {eyebrow ? <Bar w="120px" h={11} /> : null}
        <Bar w="min(320px, 70vw)" h={38} className="rounded-xl" />
      </div>
      {stats ? (
        <div className="flex w-full gap-4 sm:w-auto sm:gap-10">
          {Array.from({ length: stats }, (_, i) => <div key={i} className="flex-1 space-y-2 sm:flex-none"><Bar w="64px" h={36} className="rounded-lg" /><Bar w="56px" h={10} /></div>)}
        </div>
      ) : null}
    </div>
  );
}

function ComposerShell({ width }: { width: number }) {
  return (
    <>
      <div aria-hidden className="h-28 shrink-0" />
      <div className="bg-fade pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3.5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-10 sm:px-10 sm:pb-[30px] sm:pt-[60px]">
        <div className="glass mx-auto flex h-[52px] items-center gap-2 rounded-[24px] p-1.5 sm:h-[56px] sm:rounded-[26px] sm:p-[7px]" style={{ maxWidth: width }}>
          <span className="size-[38px] rounded-full border border-border sm:size-10" />
          <Bar w="45%" h={12} />
          <span className="ms-auto size-[38px] rounded-full bg-primary-fill opacity-30 sm:size-10" />
        </div>
      </div>
    </>
  );
}

export function PageSkeleton({ kind }: { kind: Kind }) {
  const narrow = kind === "home" || kind === "chat";
  return (
    <div role="status" aria-busy="true" aria-label="جارٍ التحميل"
      className={`skel-shimmer mx-auto flex w-full flex-1 flex-col px-4 sm:px-10 ${kind === "chat" ? "sm:max-w-[820px] sm:px-6" : narrow ? "max-w-[960px] sm:px-6" : "max-w-[1360px]"}`}>
      {kind === "home" ? (
        <>
          <div className="space-y-3 pt-4 sm:pt-[52px]"><Bar w="110px" h={11} /><Bar w="min(380px, 80vw)" h={40} className="rounded-xl" /></div>
          <div className="mt-6 flex gap-3"><Bar w="30px" h={30} className="rounded-[9px]" /><div className="flex-1 space-y-2"><Bar w="80%" h={14} /><Bar w="55%" h={14} /></div></div>
          <div className="mt-8 grid gap-4 sm:grid-cols-[1fr_minmax(0,0.55fr)]"><Card><Rows n={3} /></Card><Card><Bar w="90px" h={11} /><Bar w="110px" h={72} className="mt-6 rounded-2xl" /><Bar w="60%" h={10} className="mt-6" /></Card></div>
        </>
      ) : null}
      {kind === "chat" ? (
        <div className="space-y-6 pt-4 sm:pt-6">
          <div className="flex justify-center"><Bar w="220px" h={30} className="rounded-full" /></div>
          <div className="ms-auto w-[70%] rounded-[22px] border border-border-2 bg-card p-4"><Bar w="90%" h={12} /><Bar w="60%" h={12} className="mt-2" /></div>
          <div className="flex gap-3"><Bar w="28px" h={28} className="rounded-[9px]" /><div className="flex-1 space-y-2"><Bar w="75%" h={13} /><Bar w="40%" h={13} /></div></div>
          <Card><Bar w="140px" h={14} /><Rows n={4} /><Bar w="100%" h={44} className="mt-3 rounded-full" /></Card>
        </div>
      ) : null}
      {kind === "case" ? (
        <>
          <div className="space-y-3 pt-4 sm:pt-8"><Bar w="140px" h={12} /><Bar w="min(360px, 75vw)" h={40} className="rounded-xl" /><Bar w="180px" h={14} /></div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:flex sm:gap-10">{Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2"><Bar w="60px" h={10} /><Bar w="120px" h={14} /></div>)}</div>
          <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
            <div className="space-y-5"><div className="flex gap-3"><Bar w="32px" h={32} className="rounded-[10px]" /><div className="flex-1 space-y-2"><Bar w="85%" h={14} /><Bar w="50%" h={14} /></div></div><Card><Bar w="80px" h={14} /><Rows n={3} /></Card><div className="grid gap-4 sm:grid-cols-2"><Card><Rows n={2} line={false} /></Card><Card><Rows n={2} line={false} /></Card></div></div>
            <div className="hidden space-y-5 lg:block"><Card><Bar w="70px" h={56} className="rounded-xl" /><Bar w="60%" h={12} className="mt-4" /></Card><Card><Rows n={3} /></Card><Card><Rows n={3} /></Card></div>
          </div>
        </>
      ) : null}
      {kind === "roll" ? (
        <>
          <Header stats={1} />
          <div className="mt-6 grid grid-cols-6 gap-2 sm:gap-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex flex-col items-center gap-2 rounded-2xl py-3"><Bar w="32px" h={10} /><Bar w="36px" h={26} className="rounded-lg" /><Bar w="18px" h={5} /></div>)}</div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_455px]">
            <div className="space-y-6 border-s border-[var(--hairline-v2)] ps-6">{[0, 1, 2].map((i) => <div key={i} className="space-y-3"><Bar w="200px" h={14} /><Card className={i ? "" : "pb-8"}><Rows n={1} line={false} />{i ? null : <Bar w="100%" h={48} className="mt-3 rounded-full" />}</Card></div>)}</div>
            <div className="hidden lg:block"><Card><Bar w="140px" h={14} /><Rows n={3} /></Card></div>
          </div>
        </>
      ) : null}
      {kind === "cases" ? (
        <>
          <Header />
          <div className="mt-6 flex gap-2">{Array.from({ length: 4 }, (_, i) => <Bar key={i} w="88px" h={34} className="rounded-full" />)}</div>
          <Card className="mt-4 !p-0"><div className="border-b border-[var(--hairline-v2)] px-6 py-3"><Bar w="40%" h={10} /></div><div className="px-6"><Rows n={7} /></div></Card>
        </>
      ) : null}
      <ComposerShell width={780} />
    </div>
  );
}
