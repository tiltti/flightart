// Poster-matte frame: double hairline + corner diamonds around the screen.
export default function DecoFrame() {
  const corners = [
    "-left-1 -top-1",
    "-right-1 -top-1",
    "-bottom-1 -left-1",
    "-bottom-1 -right-1",
  ];
  return (
    <div className="pointer-events-none absolute inset-3 z-30">
      <div className="absolute inset-0 border border-line" />
      <div className="absolute inset-[7px] border border-accent/15" />
      {corners.map((pos) => (
        <span
          key={pos}
          className={`absolute ${pos} h-2 w-2 rotate-45 bg-accent/50`}
        />
      ))}
    </div>
  );
}
