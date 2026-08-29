import { useEffect, useRef, useState } from "react";

export default function TruncateCell({ value, maxWidth = "8rem" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const text = value || "—";

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="block cursor-pointer truncate text-left"
        style={{ maxWidth }}
      >
        {text}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-w-xs whitespace-normal break-words rounded-lg border border-white/10 bg-[#1f2330] p-2 text-xs text-gray-200 shadow-lg">
          {text}
        </div>
      )}
    </div>
  );
}
