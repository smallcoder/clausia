/** The Clausia «C» tile (the logo): ink in light, champagne in dark. */
export function ClausiaMark({ size = 34 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.53, borderRadius: size * 0.3 }}
      className="mark font-num inline-flex shrink-0 items-center justify-center font-extrabold">
      C
    </span>
  );
}
